import React, { Component } from "react";
import { ref_face_vertices } from "./face-config";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

// XXX: From @Narsil: Don't touch this code unless you are sure about this.
// It took an afternoon to get this correct and check different combinations
// End solution came from here and is the cleanest found at the time:
// https://stackoverflow.com/questions/35968047/using-webpack-threejs-examples-and-typescript/36324615
// AND had to change imports-> imports-loader
//
// Three.js does include the correct types for typescript, but does NOT include
// OBJLoader and the stuff in the examples. The trick here is to load the actual JS
// along with the type definitions from @types/three.
// const THREE = require('three');
// THREE.OBJLoader = require('imports-loader?THREE=three!exports-loader?THREE.OBJLoader!../../node_modules\/three\/examples\/js\/loaders\/OBJLoader');
/* eslint-disable import/no-webpack-loader-syntax */
// THREE.FBXLoader = require('imports-loader?THREE=three!exports-loader?THREE.FBXLoader!../node_modules/three/examples/js/loaders/FBXLoader');
// THREE.GLTFLoader = require('imports-loader?THREE=three!exports-loader?THREE.GLTFLoader!../../node_modules\/three\/examples\/js\/loaders\/GLTFLoader');
// THREE.OrbitControls = require('imports-loader?THREE=three!exports-loader?THREE.OrbitControls!../../node_modules\/three\/examples\/js\/controls\/OrbitControls');

export const colors = [
    0xe6194b,
    0x3cb44b,
    0xffe119,
    0x4363d8,
    0xf58231,
    0x911eb4,
    0x42d4f4,
    0xf032e6,
    0xbfef45,
    0xfabebe,
    0x469990,
    0xe6beff,
    0x9a6324,
    0xfffac8,
    0x800000,
    0xaaffc3,
    0x808000,
    0xffd8b1,
    0x000075,
    0xa9a9a9,
    0xffffff,
    0x000000
];

export class Scene {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    frameId?: number;

    constructor(width: number, height: number) {
        //ADD SCENE
        this.scene = new THREE.Scene();

        //ADD CAMERA
        this.camera = new THREE.OrthographicCamera(
            // -width / 2, width / 2, +height / 2, -height / 2,
            // -60, 60, -60, 60,
            -1,
            1,
            1,
            -1,
            0.01,
            1000
        );
        this.camera!.position.set(0, 0, 0);
        // var controls = new THREE.OrbitControls(this.camera);
        //ADD RENDERER
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        // this.renderer.setClearColor(0x000000, 0); // the default

        this.renderer.setSize(width, height);
    }

    public async load(url: string): Promise<THREE.Object3D> {
        const ext = url.slice(-4);
        if (ext === ".fbx") {
            return new Promise(resolve => {
                const loader = new FBXLoader();
                loader.load(url, resolve);
            });
            // }else if (ext == '.obj'){
            // 		return new Promise(resolve => {
            // 				const loader = new THREE.OBJLoader()
            // 				loader.load(url, resolve)
            // 		});
            // }else if (ext == 'gltf' || ext == '.glb'){
            // 		return new Promise(resolve => {
            // 				const loader = new THREE.GLTFLoader()

            // 				loader.load(url, (gltf_obj: THREE.GLTF) => {resolve(gltf_obj.scenes[0].children[0])})
            // 		});
        } else {
            throw new Error(`Can't load object ${url}, extension unknown`);
        }
    }

    public add(obj: THREE.Object3D) {
        this.scene.add(obj);
    }

    public get(obj_string: string): THREE.Object3D | undefined {
        const obj = this.scene.getObjectByName(obj_string);
        return obj;
    }

    public remove(obj_string: string) {
        const obj = this.scene.getObjectByName(obj_string);
        if (obj) {
            this.scene.remove(obj);
        }
    }

    public start = () => {
        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.animate);
        }
    };
    public stop = () => {
        cancelAnimationFrame(this.frameId!);
    };
    private animate = () => {
        this.render();
        this.frameId = window.requestAnimationFrame(this.animate);
    };
    public render() {
        this.renderer.render(this.scene, this.camera);
    }
}

export class THREEScene extends Component {
    frameId?: number;
    scene?: Scene;
    mount?: HTMLDivElement | null;

    componentDidMount() {
        this.scene = new Scene(
            this.mount!.clientWidth,
            this.mount!.clientHeight
        );
        this.mount!.appendChild(this.scene!.renderer.domElement);
        var that = this;
        // this.scene!.load(glass.filename).then((obj) =>{
        // 		that.scene!.add(obj)
        // })
        this.scene!.load(process.env.PUBLIC_URL + "/3dmodels/face.fbx").then(
            obj => {
                console.log("face obj", obj);
                // DEBUG: Add control points.
                for (var i = 0; i < 3; i++) {
                    const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
                    const cmaterial = new THREE.MeshBasicMaterial({
                        color: colors[i % colors.length]
                    });
                    const cube = new THREE.Mesh(geometry, cmaterial);
                    cube.position.x += ref_face_vertices.get(0, i);
                    cube.position.y += ref_face_vertices.get(1, i);
                    cube.position.z += ref_face_vertices.get(2, i);
                    obj.add(cube);
                }
                obj.translateZ(-10);
                const ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
                obj.add(ambientLight);
                const light = new THREE.PointLight(0xffffff, 0.5, 100);
                light.position.set(1, 1, 50);
                obj.add(light);
                that.scene!.add(obj);
            }
        );

        var ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);

        this.scene.add(ambientLight);
        var light = new THREE.PointLight(0xffffff, 0.5, 100);
        light.position.set(1, 1, 1);
        this.scene.add(light);
        this.scene.start();
    }
    componentWillUnmount() {
        this.scene!.stop();
        this.mount!.removeChild(this.scene!.renderer.domElement);
    }
    render() {
        return (
            <div
                style={{
                    width: "640px",
                    height: "480px",
                    border: "1px solid black"
                }}
                ref={mount => {
                    this.mount = mount;
                }}
            ></div>
        );
    }
}
export default THREEScene;
