import {Tensor, InferenceSession} from 'onnxjs';
import * as faceapi from 'face-api.js';
import * as nj from 'numjs';
import {Scene, colors} from './scene';
import {
  param_std,
  param_mean,
  u_base,
  w_exp_base,
  w_shp_base,
  ref_face_vertices,
} from './face-config';
import * as THREE from 'three';
import {solve, determinant} from './solver';

function translation(x: number, y :number, z: number): THREE.Matrix4{
  return new THREE.Matrix4().set(
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1
  )
}

function scale(x: number, y :number, z: number): THREE.Matrix4{
  return new THREE.Matrix4().set(
     x, 0, 0, 0,
     0, y, 0, 0,
     0, 0, z, 0,
     0, 0, 0, 1
  )
}
function rotation(R: nj.NdArray): THREE.Matrix4{
  // R should be 3x3
  return new THREE.Matrix4().set(
    R.get(0, 0), R.get(0, 1), R.get(0, 2), 0,
    R.get(1, 0), R.get(1, 1), R.get(1, 2), 0,
    R.get(2, 0), R.get(2, 1), R.get(2, 2), 0,
    0, 0, 0, 1
  )
}

class MasterGroup extends THREE.Group {
  private clone_index = 0;

  constructor(private scene: Scene) {
    super();
  }

  private reset_clones() {
    for (var i = 0; i < this.clone_index; i++) {
      const group = this.scene.get('face_' + i);
      if (group !== undefined) {
        this.scene.remove('face_' + i);
        const clone = this.clone();
        clone.name = 'face_' + i;
        this.scene.add(clone);
      }
    }
  }

  public add_face(transparent?: boolean) {
    if (transparent === undefined) {
      transparent = true;
    }
    const self = this;
      this.scene.load(process.env.PUBLIC_URL + '/3dmodels/face.fbx').then(face => {
      if (transparent) {
        const mesh = face.children[0] as THREE.Mesh;
        mesh.renderOrder = -1;
        const material = mesh.material as THREE.Material;

        // Makes the face occluding, but we write the background
        // Color, so alpha instead of texture.
        material.colorWrite = false;
      }
      self.add(face);
      self.reset_clones();
    });
  }

  public add_element(filename: string) {
    const self = this;
    this.scene.load(filename).then(object_group => {
      object_group.name = filename;
      self.add(object_group);
      self.reset_clones();
    });
  }

  private find_element(name: string): THREE.Object3D | undefined {
    for (let child of this.children) {
      if (child.name === name) {
        return child;
      }
    }
  }

  public remove_element(filename: string) {
    const obj = this.find_element(filename);
    if (obj) {
      this.remove(obj);
    }
    this.reset_clones();
  }

  public create_clone(): THREE.Group {
    this.clone_index++;
    return this.clone();
  }

  public remove_clone() {
    this.clone_index--;
  }
}

export class Face {
  is_model_loaded = false;
  backend = 'wasm';
  model_url = 'models/face.onnx';
  std_size = 120; // Input of face.onnx 120x120
  facedetector_dir = './models';
  margin = 20; // margin because bounding boxes are super tight.
  session?: InferenceSession;
  scene: Scene;
  group: MasterGroup;
  current_R?: nj.NdArray;
  current_T?: nj.NdArray;
  current_s?: nj.NdArray;
  last_detections = 0;

  public addElement(element: string) {
      this.group.add_element(process.env.PUBLIC_URL + `/3dmodels/${element}.fbx`);
  }
  public removeElement(element: string) {
      this.group.remove_element(process.env.PUBLIC_URL + `/3dmodels/${element}.fbx`);
  }

  public async loadModel() {
    if (!this.is_model_loaded) {
      this.session = new InferenceSession({backendHint: this.backend});
      await this.session.loadModel(this.model_url);
      await faceapi.loadTinyFaceDetectorModel(this.facedetector_dir);

      this.is_model_loaded = true;
    }
  }

  constructor() {
    this.scene = new Scene(640, 480);
    const ambientLight = new THREE.AmbientLight(0xcccccc, 0.8);
    this.scene.add(ambientLight);
    const light = new THREE.PointLight(0xffffff, 0.6, 100);
    light.position.set(1, 1, 50);
    this.scene.add(light);

    this.group = new MasterGroup(this.scene);
    this.group.add_face();
    this.group.matrixAutoUpdate = false;
  }

  private getInputs(
    img: HTMLCanvasElement,
    detection: faceapi.FaceDetection,
  ): Tensor {
    const sx = detection.box.x - this.margin;
    const sy = detection.box.y - this.margin;
    const sw = detection.box.width + 2 * this.margin;
    const sh = detection.box.height + 2 * this.margin;

    const canvas = document.createElement('canvas') as HTMLCanvasElement;
    canvas.width = this.std_size;
    canvas.height = this.std_size;

    // Copy the image contents to the canvas
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, this.std_size, this.std_size);
    const imageData = ctx.getImageData(
      0,
      0,
      ctx.canvas.width,
      ctx.canvas.height,
    );
    const {data, width, height} = imageData;
    // data processing
    const input = new Float32Array(width * height * 3);
    var L = width * height;
    for (let i = 0, len = data.length; i < len; i += 4) {
      var index = i / 4;
      input[index] = (data[i + 2] - 127.5) / 128;
      input[index + 1 * L] = (data[i + 1] - 127.5) / 128;
      input[index + 2 * L] = (data[i + 0] - 127.5) / 128;
    } // Input in BGR format
    const tensor = new Tensor(input, 'float32', [1, 3, height, width]);
    return tensor;
  }

  private reconstructVertex(
    param: Tensor,
    base: nj.NdArray,
    shp_base: nj.NdArray,
    exp_base: nj.NdArray,
    outpoints: number,
  ): nj.NdArray {
    var values: nj.NdArray = nj.array([].slice.call(param.data));
    var njparam = values.multiply(param_std).add(param_mean);
    // param = param * param_std + param_mean;
    var p_ = njparam.slice([0, 12]).reshape(3, 4) as nj.NdArray;
    var R = p_.slice([0, 3], [0, 3]) as nj.NdArray;
    var T = p_.slice([0, 3], [3, 4]) as nj.NdArray;
    var alpha_shp = njparam.slice([12, 52]).reshape(40, 1) as nj.NdArray;
    var alpha_exp = njparam.slice(52).reshape(10, 1) as nj.NdArray;

    // Recasting T from 3x1 to 3xN
    var offset = nj.zeros([3, outpoints]) as nj.NdArray;
    for (var i = 0; i < outpoints; i += 1) {
      for (var j = 0; j < 3; j += 1) {
        offset.slice(j, [i, i + 1]).assign(T.get(j, 0), false);
      }
    }

    // Equivalent python
    // vertex = p @ (u_base + w_shp_base @ alpha_shp + w_exp_base @ alpha_exp).reshape(3, -1, order='F') + offset
    var w_shp = nj.dot(shp_base, alpha_shp);
    var w_exp = nj.dot(exp_base, alpha_exp);
    var u = base
      .add(w_shp)
      .add(w_exp)
      .T.reshape(outpoints, 3).T as nj.NdArray;
    // Equivalent of reshape(3, N, order='F')
    var vertex = nj.dot(R, u).add(offset);

    return vertex
      .divide(120)
      .multiply(2)
      .subtract(1);
  }

  private reconstruct68(param: Tensor): nj.NdArray {
    return this.reconstructVertex(param, u_base, w_shp_base, w_exp_base, 68);
  }

  private drawAnswer(
    outcanvas: HTMLCanvasElement,
    vertices: nj.NdArray[],
    detections: faceapi.FaceDetection[],
    color: string,
  ) {
    const ctx = outcanvas.getContext('2d')!;
    ctx.fillStyle = `rgba(${color}, 1)`;
    for (var j = 0; j < detections.length; j++) {
      var detection = detections[j];
      var vertex = vertices[j];
      var sx = detection.box.x - this.margin;
      var sy = detection.box.y - this.margin;
      var sw = detection.box.width + 2 * this.margin;
      var sh = detection.box.height + 2 * this.margin;

      var scale_x = sw;
      var scale_y = sh;

      for (var i = 0; i < vertex.shape[1]; i += 1) {
        // Put from [-1; 1] to [0; 1]
        var vx: number = (vertex.get(0, i) + 1) / 2;
        // y-axis is inverted for image default basis.
        var vy: number = (-vertex.get(1, i) + 1) / 2;
        var x = vx * scale_x + sx;
        var y = vy * scale_y + sy;
        ctx.fillRect(x - 1, y - 1, 3, 3);
      }
      ctx.strokeRect(sx, sy, sw, sh);
    }
  }

  private drawGlasses(scene: Scene, outcanvas: HTMLCanvasElement) {
    const canvas3d = scene.renderer.domElement;
    this.scene!.render();
    var ctx = outcanvas.getContext('2d')!;
    ctx.drawImage(canvas3d, 0, 0);
  }

  private positionGlasses(
    face_vertices: nj.NdArray,
    glass_vertices: nj.NdArray,
    detection: faceapi.FaceDetection,
  ): THREE.Group {
    var arrays;
    if (this.current_R) {
      arrays = solve(
        face_vertices,
        glass_vertices,
        this.current_R,
        this.current_T,
        this.current_s,
        10,
      );
    } else {
      arrays = solve(face_vertices, glass_vertices);
    }
    const R = arrays[0];
    const s = arrays[1].get(0);
    const T = arrays[2];
    this.current_R = R;
    this.current_s = arrays[1];
    this.current_T = T;
    const group = new THREE.Group();

    // const N = face_vertices.shape[1]
    // var Tb = nj.zeros([3, N])
    // for (var i = 0; i < N; i += 1){
    // 		for(var j = 0; j < 3; j += 1){
    // 				Tb.slice(j, [i, i+1]).assign(T.get(j, 0), false);
    // 		}
    // }
    // const transformed = nj.dot(R, glass_vertices_norm.multiply(s)).add(Tb)

    const d = determinant(R)[0].get(0);
    const m = d > 0 ? Math.pow(d, 1 / 3) : -Math.pow(-d, 1 / 3);
    const s_ = s * m;
    const R_ = R.multiply(1 / m);

    const sM = scale(s_, s_, s_);
    const tM = translation(T.get(0, 0), T.get(0, 1), T.get(0, 2));
    const rM = rotation(R_);
    const orientation = new THREE.Matrix4()
      .multiply(tM)
      .multiply(sM)
      .multiply(rM);
    const rescale = this.rescaledMatrix(detection);

    const matrix = new THREE.Matrix4().multiply(rescale).multiply(orientation);

    group.matrix = matrix;

    return group;
  }

  private rescaledMatrix(detection: faceapi.FaceDetection): THREE.Matrix4 {
    var sx = detection.box.x - this.margin;
    var sy = detection.box.y - this.margin;
    var sw = detection.box.width + 2 * this.margin;
    var sh = detection.box.height + 2 * this.margin;

    // Offset in [0; 1] space
    const scale_x = sw / 640;
    const scale_y = sh / 480;
    const scale_z = (scale_x + scale_y) / 2;

    var offset_x = sx / 640;
    // y-axis is flipped in image space
    var offset_y = (480 - sh - sy) / 480;

    const ones = translation(1, 1, 1);
    const scale_half = scale(0.5, 0.5, 0.5);
    const real_scale = scale(scale_x, scale_y, scale_z);
    const _offset = translation(offset_x, offset_y, 0);
    const scale_double = scale(2, 2, 2);
    const minus_ones = translation(-1, -1, -1);

    const matrix = new THREE.Matrix4()
      .multiply(minus_ones)
      .multiply(scale_double)
      .multiply(_offset)
      .multiply(real_scale)
      .multiply(scale_half)
      .multiply(ones);
    return matrix;
  }

  private drawDetectedVertices(
    scene: Scene,
    all_vertices: nj.NdArray[],
    detections: faceapi.FaceDetection[],
  ) {
    for (var i = 0; i < detections.length; i++) {
      const detection = detections[i];

      const vertices = all_vertices[i];
      const matrix = this.rescaledMatrix(detection);
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.matrix = matrix;
      group.name = 'tmp';
      scene.remove('tmp');

      for (var j = 0; j < 3; j++) {
        var geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        var material = new THREE.MeshBasicMaterial({
          color: colors[j % colors.length],
        });
        var cube = new THREE.Mesh(geometry, material);
        cube.position.x += vertices.get(0, j);
        cube.position.y += vertices.get(1, j);
        cube.position.z += vertices.get(2, j);

        group.add(cube);
      }
      scene.add(group);
    }
  }

  public async detectFaces(
    incanvas: HTMLCanvasElement,
    outcanvas: HTMLCanvasElement,
  ) {
    var ctx = outcanvas.getContext('2d')!;
    if (!this.is_model_loaded) {
      return;
    }
    const detections = await faceapi.detectAllFaces(
      incanvas,
      new faceapi.TinyFaceDetectorOptions(),
    );
    if (detections.length === 0) {
      // Draw empty scene
      ctx.drawImage(incanvas, 0, 0);
      return;
    }

    var i = 0;
    if (detections.length < this.last_detections) {
      for (i = detections.length; i < this.last_detections; i++) {
        this.group.remove_clone();
        this.scene.remove('face_' + i);
      }
    } else if (detections.length > this.last_detections) {
      for (i = this.last_detections; i < detections.length; i++) {
        const clone = this.group.create_clone();
        clone.name = 'face_' + i;
        this.scene.add(clone);
      }
    }
    this.last_detections = detections.length;

    var vertices = [];
    for (i = 0; i < detections.length; i += 1) {
      var detection = detections[i];
      const inferenceInputs = this.getInputs(incanvas, detection);
      const outputData = await this.session!.run([inferenceInputs]);
      const output = outputData.values().next().value;

      const face_vertices = this.reconstruct68(output);
      vertices.push(face_vertices);

      var position_group = this.positionGlasses(
        face_vertices,
        ref_face_vertices,
        detection,
      );

      const group = this.scene.get('face_' + i);
      group!.matrix = position_group.matrix;
    }

    ctx.drawImage(incanvas, 0, 0);
    this.drawGlasses(this.scene, outcanvas);
  }
}
