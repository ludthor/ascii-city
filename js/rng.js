export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(seed, x, y) {
  let n = seed | 0;
  n = Math.imul(n ^ Math.imul(x | 0, 374761393), 1274126177);
  n = Math.imul(n ^ Math.imul(y | 0, 668265263), 2246822519);
  n = (n ^ (n >>> 16)) >>> 0;
  return n;
}

export function rand01(seed, x, y) {
  return hash2(seed, x, y) / 4294967296;
}

export function valueNoise2(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = rand01(seed, x0, y0);
  const v10 = rand01(seed, x0 + 1, y0);
  const v01 = rand01(seed, x0, y0 + 1);
  const v11 = rand01(seed, x0 + 1, y0 + 1);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}
