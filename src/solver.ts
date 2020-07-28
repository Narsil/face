import * as nj from 'numjs';

export function determinant(R: nj.NdArray): nj.NdArray[] {
  const a = R.get(0, 0);
  const b = R.get(0, 1);
  const c = R.get(0, 2);
  const d = R.get(1, 0);
  const e = R.get(1, 1);
  const f = R.get(1, 2);
  const g = R.get(2, 0);
  const h = R.get(2, 1);
  const i = R.get(2, 2);

  const G = (nj.array([
    [e * i - h * f, g * f - d * i, d * h - e * g],
    [c * h - b * i, a * i - c * g, b * g - a * h],
    [f * b - c * e, d * c - a * f, a * e - b * d],
  ]) as unknown) as nj.NdArray<number>;
  const det = nj.array([a * G.get(0, 0) + b * G.get(0, 1) + c * G.get(0, 2)]);
  return [det, G];
}

function function_objective_gradient(
  glass_vertices: nj.NdArray,
  face_vertices: nj.NdArray,
  R: nj.NdArray,
  T: nj.NdArray,
  scale: nj.NdArray,
  lambda_1: number,
  lambda_2: number,
): nj.NdArray[] {
  const I = (nj.array([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]) as unknown) as nj.NdArray<number>;

  const cache_0 = nj.dot(R, glass_vertices);
  // Recasting T from 3x1 to 3xN
  const N = glass_vertices.shape[1];
  var Tb = nj.zeros([3, N]);
  for (var i = 0; i < N; i += 1) {
    for (var j = 0; j < 3; j += 1) {
      Tb.slice(j, [i, i + 1]).assign(T.get(j, 0), false);
    }
  }
  const cache_1 = cache_0
    .multiply(scale.get(0))
    .add(Tb)
    .subtract(face_vertices);
  const loss = cache_1.pow(2).sum();
  const cache_2 = nj.dot(R.T, R).subtract(I);
  const orth_reg = cache_2.pow(2).sum();
  const results = determinant(R);
  const det_R = results[0];
  const adjoint_R = results[1];
  const det_reg = det_R
    .subtract(1)
    .pow(2)
    .sum();
  const fun_obj = loss + lambda_1 * orth_reg + lambda_2 * det_reg;
  const grad_R = nj
    .dot(cache_1, glass_vertices.T.multiply(scale.get(0)))
    .multiply(2)
    .add(nj.dot(cache_2, R).multiply(4 * lambda_1))
    .add(adjoint_R.multiply(det_R.subtract(1).get(0)).multiply(2 * lambda_2));
  const ones = nj.ones([cache_1.shape[1], 1]);

  const grad_T = nj.dot(cache_1, ones).multiply(2);
  const grad_s = nj.sum(cache_0.multiply(cache_1)) * 2;
  return [nj.array([fun_obj]), grad_R, grad_T, nj.array([grad_s])];
}

export function solve(
  face_vertices: nj.NdArray,
  glass_vertices: nj.NdArray,
  R?: nj.NdArray,
  T?: nj.NdArray,
  s?: nj.NdArray,
  iterations?: number,
): nj.NdArray[] {
  const lr = 1e-2;
  const lambda_1 = 1e-3;
  const lambda_2 = 1e-3; // 1e-1 for no warping 1e-3 for best.

  if (!R) {
    R = (nj.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]]) as unknown) as nj.NdArray<
      number
    >;
  }
  if (!T) {
    T = (nj.array([[0], [0], [0]]) as unknown) as nj.NdArray<number>;
  }
  if (!s) {
    s = nj.array([1]);
  }
  if (!iterations) {
    iterations = 1000;
  }

  for (var i = 0; i < iterations; i++) {
    const results = function_objective_gradient(
      glass_vertices,
      face_vertices,
      R,
      T,
      s,
      lambda_1,
      lambda_2,
    );

    const grad_R = results[1];
    const grad_T = results[2];
    const grad_s = results[3];
    R = R.subtract(grad_R.multiply(lr));
    T = T.subtract(grad_T.multiply(lr));
    s = s.subtract(grad_s.multiply(lr));
  }
  return [R, s, T];
}
