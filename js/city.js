import { mulberry32, rand01, valueNoise2 } from "./rng.js";
import { C } from "./display.js";

export const FLOOR_STREET = 0;
export const FLOOR_SIDEWALK = 1;
export const FLOOR_PARK = 2;
export const FLOOR_ALLEY = 3;
export const FLOOR_PLAZA = 4;

export const ROOF_NONE = 0;
export const ROOF_MAST = 1;
export const ROOF_DISH = 2;

export const MAP_SIZE = 96;
const AVENUE_EVERY = 14;
const AVENUE_WIDTH = 2;
const STREET_EVERY = 7;

export function generateCity(seedStr, numericSeed) {
  const rng = mulberry32(numericSeed);
  const w = MAP_SIZE;
  const h = MAP_SIZE;
  const n = w * h;

  const solid = new Uint8Array(n);
  const floor = new Uint8Array(n);
  const height = new Float32Array(n);
  const pal = new Uint8Array(n);
  const pattern = new Uint8Array(n);
  const neon = new Uint8Array(n);
  const foliage = new Uint8Array(n);
  const bldg = new Uint16Array(n);
  const roof = new Uint8Array(n);
  const bridge = new Uint8Array(n);
  const bridgePal = new Uint8Array(n);
  const bridgePat = new Uint8Array(n);
  const bridgeLo = new Uint8Array(n);
  const bridgeHi = new Uint8Array(n);
  const spans = [];

  const road = new Uint8Array(n);
  const cx0 = (w / 2) | 0;
  const cy0 = (h / 2) | 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const onAveX = x % AVENUE_EVERY < AVENUE_WIDTH;
      const onAveY = y % AVENUE_EVERY < AVENUE_WIDTH;
      const onStX = x % STREET_EVERY === 0;
      const onStY = y % STREET_EVERY === 0;
      const nearSpawn = Math.abs(x - cx0) <= 4 && Math.abs(y - cy0) <= 4;

      if (onAveX || onAveY) {
        road[i] = 1;
      } else if (onStX || onStY) {
        const segX = (x / STREET_EVERY) | 0;
        const segY = (y / STREET_EVERY) | 0;
        const drop = rand01(numericSeed ^ 0x9e3779b9, segX, segY) < 0.16;
        if (!drop || nearSpawn) road[i] = 1;
      }
    }
  }

  const seen = new Uint8Array(n);
  let nextId = 1;
  const stack = [];
  const plazaLots = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const start = y * w + x;
      if (road[start] || seen[start]) continue;

      stack.length = 0;
      stack.push(start);
      seen[start] = 1;
      const cells = [];
      let minx = x,
        maxx = x,
        miny = y,
        maxy = y;

      while (stack.length) {
        const i = stack.pop();
        cells.push(i);
        const cx = i % w;
        const cy = (i / w) | 0;
        if (cx < minx) minx = cx;
        if (cx > maxx) maxx = cx;
        if (cy < miny) miny = cy;
        if (cy > maxy) maxy = cy;
        const nbrs = [i - 1, i + 1, i - w, i + w];
        for (let k = 0; k < 4; k++) {
          const j = nbrs[k];
          const nx = j % w;
          const ny = (j / w) | 0;
          if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
          if (seen[j] || road[j]) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }

      const area = cells.length;
      const mx = (minx + maxx) * 0.5;
      const my = (miny + maxy) * 0.5;
      const dx = mx / w - 0.5;
      const dy = my / h - 0.5;
      const dist = Math.hypot(dx, dy) * 2;
      const downtown = Math.max(0, 1 - dist);
      const n1 = valueNoise2(numericSeed, mx * 0.18, my * 0.18);
      const isPark = area > 12 && rng() < 0.1 + downtown * 0.04 + (1 - downtown) * 0.03;
      const id = nextId++;

      let baseH = 3.4 + downtown * downtown * 16 + n1 * 6 + rng() * 2.8;
      if (downtown > 0.55 && rng() < 0.14) baseH *= 1.55;
      baseH = Math.max(2.2, Math.min(26, baseH));

      let palette;
      if (baseH > 14) palette = rng() < 0.62 ? C.CYAN : C.BLUE;
      else if (baseH > 8) palette = rng() < 0.58 ? C.YELLOW : C.CYAN;
      else if (rng() < 0.16) palette = C.ORANGE;
      else palette = rng() < 0.62 ? C.YELLOW : C.AMBER;

      const pat = (rng() * 6) | 0;
      const hasNeon = rng() < 0.42 || palette === C.MAGENTA;
      const hasFoliage = isPark || rng() < 0.22;

      for (let c = 0; c < cells.length; c++) {
        const i = cells[c];
        const cx = i % w;
        const cy = (i / w) | 0;
        const adjRoad =
          road[i - 1] || road[i + 1] || road[i - w] || road[i + w];

        if (isPark) {
          const midx = (minx + maxx) >> 1;
          const midy = (miny + maxy) >> 1;
          const cross = area > 22;
          const onPath = cx === midx || (cross && cy === midy);
          floor[i] = FLOOR_PARK;
          foliage[i] = onPath ? 0 : 1;
        } else if (adjRoad) {
          floor[i] = FLOOR_SIDEWALK;
          foliage[i] = hasFoliage && rng() < 0.35 ? 1 : 0;
        } else {
          solid[i] = 1;
          height[i] = baseH + (rand01(numericSeed, cx, cy) - 0.5) * 0.4;
          pal[i] = palette;
          pattern[i] = pat;
          neon[i] = hasNeon ? 1 : 0;
          foliage[i] = hasFoliage ? 1 : 0;
          bldg[i] = id;
        }
      }

      if (!isPark) {
        const solids = [];
        for (let c = 0; c < cells.length; c++) if (solid[cells[c]]) solids.push(cells[c]);
        if (solids.length === 0 && area > 0) {
          const i = cells[(cells.length / 2) | 0];
          solid[i] = 1;
          floor[i] = FLOOR_STREET;
          height[i] = 1.8 + rng() * 2;
          pal[i] = C.MAGENTA;
          pattern[i] = 5;
          neon[i] = 1;
          bldg[i] = id;
          solids.push(i);
        }

        let cores = 0;
        for (let s = 0; s < solids.length; s++) {
          const i = solids[s];
          const cx = i % w;
          const cy = (i / w) | 0;
          const openN =
            cx <= 0 ||
            !solid[i - 1] ||
            cx >= w - 1 ||
            !solid[i + 1] ||
            cy <= 0 ||
            !solid[i - w] ||
            cy >= h - 1 ||
            !solid[i + w];
          if (!openN) cores++;
        }

        const setback = cores > 0 && baseH > 8;
        if (setback) {
          const podiumH = 3.0 + rng() * 1.6;
          const podiumPal =
            rng() < 0.22 ? C.MAGENTA : rng() < 0.4 ? C.ORANGE : rng() < 0.5 ? C.AMBER : C.YELLOW;
          const towerPal = rng() < 0.58 ? C.CYAN : C.BLUE;
          for (let s = 0; s < solids.length; s++) {
            const i = solids[s];
            const cx = i % w;
            const cy = (i / w) | 0;
            const isShell =
              cx <= 0 ||
              !solid[i - 1] ||
              cx >= w - 1 ||
              !solid[i + 1] ||
              cy <= 0 ||
              !solid[i - w] ||
              cy >= h - 1 ||
              !solid[i + w];
            if (isShell) {
              height[i] = podiumH + (rand01(numericSeed, cx, cy) - 0.5) * 0.15;
              pal[i] = podiumPal;
              neon[i] = 1;
            } else {
              height[i] = baseH + (rand01(numericSeed, cx, cy) - 0.5) * 0.35;
              pal[i] = towerPal;
              neon[i] = 0;
            }
          }
        } else {
          for (let s = 0; s < solids.length; s++) {
            const i = solids[s];
            const cx = i % w;
            const cy = (i / w) | 0;
            const isShell =
              cx <= 0 ||
              !solid[i - 1] ||
              cx >= w - 1 ||
              !solid[i + 1] ||
              cy <= 0 ||
              !solid[i - w] ||
              cy >= h - 1 ||
              !solid[i + w];
            if (!isShell) neon[i] = 0;
          }
        }

        const tall = [];
        for (let s = 0; s < solids.length; s++) if (height[solids[s]] > 10) tall.push(solids[s]);
        if (tall.length) {
          const a = tall[(rng() * tall.length) | 0];
          roof[a] = ROOF_MAST;
          if (tall.length > 1 && rng() < 0.62) {
            let b = tall[(rng() * tall.length) | 0];
            if (b === a) b = tall[(tall.indexOf(a) + 1) % tall.length];
            roof[b] = rng() < 0.45 ? ROOF_DISH : ROOF_MAST;
          }
        }

        if (downtown > 0.35 && area > 28 && maxx - minx >= 4 && maxy - miny >= 4 && rng() < 0.58) {
          const cutH = maxx - minx >= maxy - miny;
          const midx = (minx + maxx) >> 1;
          const midy = (miny + maxy) >> 1;
          for (let c = 0; c < cells.length; c++) {
            const i = cells[c];
            if (!solid[i]) continue;
            const cx = i % w;
            const cy = (i / w) | 0;
            if (cutH ? cy !== midy : cx !== midx) continue;
            solid[i] = 0;
            height[i] = 0;
            neon[i] = 0;
            pal[i] = 0;
            pattern[i] = 0;
            roof[i] = 0;
            bldg[i] = 0;
            floor[i] = FLOOR_ALLEY;
            foliage[i] = 0;
          }
        }

        if (area > 24 && downtown > 0.42) {
          plazaLots.push({ id, minx, maxx, miny, maxy, mx, my });
        }
      }
    }
  }

  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = y * w + x;
      solid[i] = 1;
      height[i] = 20;
      pal[i] = C.BLUE_DEEP;
      pattern[i] = 1;
      bldg[i] = 0xffff;
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = y * w + x;
      solid[i] = 1;
      height[i] = 20;
      pal[i] = C.BLUE_DEEP;
      pattern[i] = 1;
      bldg[i] = 0xffff;
    }
  }

  for (let i = 0; i < n; i++) {
    if (!solid[i] && !floor[i] && road[i]) floor[i] = FLOOR_STREET;
  }

  for (let i = 0; i < n; i++) {
    if (!solid[i] || !neon[i]) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const isShell =
      x <= 0 ||
      !solid[i - 1] ||
      x >= w - 1 ||
      !solid[i + 1] ||
      y <= 0 ||
      !solid[i - w] ||
      y >= h - 1 ||
      !solid[i + w];
    if (!isShell) neon[i] = 0;
  }

  let landmarkId = 0;
  let landmarkBest = Infinity;
  for (let i = 0; i < n; i++) {
    if (!solid[i] || !bldg[i] || bldg[i] === 0xffff) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const d = (x - (cx0 + 5)) * (x - (cx0 + 5)) + (y - (cy0 + 7)) * (y - (cy0 + 7));
    if (d < landmarkBest) {
      landmarkBest = d;
      landmarkId = bldg[i];
    }
  }
  if (landmarkId) {
    for (let i = 0; i < n; i++) {
      if (bldg[i] === landmarkId && height[i] > 8) {
        height[i] = Math.max(height[i], 22);
        pal[i] = C.CYAN;
        pattern[i] = 1;
      }
    }
  }

  function openRun(x, y, dx, dy) {
    let n = 0;
    let cx = x + dx;
    let cy = y + dy;
    while (n < 24 && cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1 && !solid[cy * w + cx]) {
      n++;
      cx += dx;
      cy += dy;
    }
    return n;
  }

  function streetNeighbors(x, y) {
    let n = 0;
    if (x > 0 && !solid[y * w + x - 1] && floor[y * w + x - 1] === FLOOR_STREET) n++;
    if (x < w - 1 && !solid[y * w + x + 1] && floor[y * w + x + 1] === FLOOR_STREET) n++;
    if (y > 0 && !solid[(y - 1) * w + x] && floor[(y - 1) * w + x] === FLOOR_STREET) n++;
    if (y < h - 1 && !solid[(y + 1) * w + x] && floor[(y + 1) * w + x] === FLOOR_STREET) n++;
    return n;
  }

  let spawnX = cx0 + 0.5;
  let spawnY = cy0 + 0.5;
  let spawnYaw = 0;
  let best = Infinity;
  function considerSpawn(x, y, minOpen) {
    const i = y * w + x;
    if (solid[i] || floor[i] !== FLOOR_STREET) return;
    if (streetNeighbors(x, y) < minOpen) return;
    const runE = openRun(x, y, 1, 0);
    const runW = openRun(x, y, -1, 0);
    const runS = openRun(x, y, 0, 1);
    const runN = openRun(x, y, 0, -1);
    const span = runE + runW + runS + runN;
    const d = (x - cx0) * (x - cx0) + (y - cy0) * (y - cy0);
    const score = d * 4 - span;
    if (score >= best) return;
    best = score;
    spawnX = x + 0.5;
    spawnY = y + 0.5;
    const horiz = Math.max(runE, runW);
    const vert = Math.max(runS, runN);
    if (vert > horiz) spawnYaw = runS >= runN ? Math.PI * 0.5 : -Math.PI * 0.5;
    else spawnYaw = runE >= runW ? 0 : Math.PI;
    spawnYaw += 0.38;
  }
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) considerSpawn(x, y, 2);
  }
  if (best === Infinity) {
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) considerSpawn(x, y, 0);
    }
  }

  let plazaX = 0;
  let plazaY = 0;
  let plazaId = 0;
  let plazaBest = Infinity;
  for (let p = 0; p < plazaLots.length; p++) {
    const lot = plazaLots[p];
    const d = (lot.mx - spawnX) * (lot.mx - spawnX) + (lot.my - spawnY) * (lot.my - spawnY);
    if (d < plazaBest) {
      plazaBest = d;
      plazaId = lot.id;
    }
  }
  if (plazaId) {
    let minx = w;
    let maxx = 0;
    let miny = h;
    let maxy = 0;
    for (let i = 0; i < n; i++) {
      if (bldg[i] !== plazaId || !solid[i]) continue;
      const cx = i % w;
      const cy = (i / w) | 0;
      if (cx < minx) minx = cx;
      if (cx > maxx) maxx = cx;
      if (cy < miny) miny = cy;
      if (cy > maxy) maxy = cy;
    }
    const pcx = (minx + maxx) >> 1;
    const pcy = (miny + maxy) >> 1;
    plazaX = pcx + 0.5;
    plazaY = pcy + 0.5;
    for (let y = pcy - 1; y <= pcy + 1; y++) {
      for (let x = pcx - 1; x <= pcx + 1; x++) {
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const i = y * w + x;
        if (solid[i] && bldg[i] !== plazaId) continue;
        if (!solid[i] && floor[i] === FLOOR_STREET) continue;
        solid[i] = 0;
        height[i] = 0;
        neon[i] = 0;
        roof[i] = 0;
        bldg[i] = 0;
        floor[i] = FLOOR_PLAZA;
        foliage[i] = 0;
      }
    }
    for (let i = 0; i < n; i++) {
      if (bldg[i] !== plazaId || !solid[i]) continue;
      const x = i % w;
      const y = (i / w) | 0;
      const isShell =
        x <= 0 ||
        !solid[i - 1] ||
        x >= w - 1 ||
        !solid[i + 1] ||
        y <= 0 ||
        !solid[i - w] ||
        y >= h - 1 ||
        !solid[i + w];
      if (isShell) {
        neon[i] = 1;
        if (pal[i] === C.CYAN || pal[i] === C.BLUE) pal[i] = C.AMBER;
        else pal[i] = C.MAGENTA;
      }
    }
  }

  function lotAcross(x, y, dx, dy) {
    for (let k = 1; k <= 5; k++) {
      const nx = x + dx * k;
      const ny = y + dy * k;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) return null;
      const i = ny * w + nx;
      if (!solid[i]) continue;
      const id = bldg[i];
      if (!id) return null;
      const faceH = height[i];
      const facePal = pal[i];
      let coreH = faceH;
      let towerPal = facePal;
      let pat = pattern[i];
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const sx = nx + ox;
          const sy = ny + oy;
          if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) continue;
          const j = sy * w + sx;
          if (!solid[j] || bldg[j] !== id) continue;
          if (height[j] > coreH) {
            coreH = height[j];
            towerPal = pal[j];
          }
          pat = pattern[j];
        }
      }
      return { id, coreH, faceH, facePal, towerPal, pat };
    }
    return null;
  }

  function pairOk(a, b) {
    if (!a || !b || a.id === b.id) return false;
    if (a.faceH < 3.8 || b.faceH < 3.8) return false;
    if (Math.abs(a.faceH - b.faceH) > 1.8) return false;
    return true;
  }

  const spawnClear2 = 2.4 * 2.4;
  const seeds = [];
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const i = y * w + x;
      if (solid[i] || floor[i] !== FLOOR_STREET) continue;
      if ((x + 0.5 - spawnX) * (x + 0.5 - spawnX) + (y + 0.5 - spawnY) * (y + 0.5 - spawnY) < spawnClear2)
        continue;
      const east = lotAcross(x, y, 1, 0);
      const west = lotAcross(x, y, -1, 0);
      const north = lotAcross(x, y, 0, -1);
      const south = lotAcross(x, y, 0, 1);
      const ew = pairOk(east, west);
      const ns = pairOk(north, south);
      if (ew === ns) continue;
      const a = ew ? east : north;
      const b = ew ? west : south;
      const dx = x / w - 0.5;
      const dy = y / h - 0.5;
      if (Math.max(0, 1 - Math.hypot(dx, dy) * 2) < 0.32) continue;
      const onAveX = x % AVENUE_EVERY < AVENUE_WIDTH;
      const onAveY = y % AVENUE_EVERY < AVENUE_WIDTH;
      const ave = (ew && onAveX) || (ns && onAveY);
      const host = Math.min(a.faceH, b.faceH);
      const z1 = host - 0.28;
      const z0 = z1 - 0.62;
      if (z0 < 2.9 || z1 > host - 0.18) continue;
      const src = a.faceH <= b.faceH ? a : b;
      const sx = x + 0.5 - spawnX;
      const sy = y + 0.5 - spawnY;
      const ahead = sx * Math.cos(spawnYaw) + sy * Math.sin(spawnYaw);
      seeds.push({
        x,
        y,
        ew,
        ave,
        pal: src.facePal,
        pat: src.pat,
        z0,
        z1,
        d: sx * sx + sy * sy,
        ahead,
      });
    }
  }
  seeds.sort((a, b) => {
    const sa = a.d - Math.max(0, a.ahead) * 20 - (a.ave ? 4 : 0);
    const sb = b.d - Math.max(0, b.ahead) * 20 - (b.ave ? 4 : 0);
    return sa - sb;
  });

  function paintCell(i, c, kind) {
    bridge[i] = kind;
    bridgePal[i] = c.pal;
    bridgePat[i] = c.pat;
    bridgeLo[i] = Math.max(1, Math.min(250, (c.z0 * 10) | 0));
    bridgeHi[i] = Math.max(bridgeLo[i] + 4, Math.min(254, (c.z1 * 10) | 0));
  }

  function firstWall(x, y, dx, dy) {
    for (let k = 1; k <= 6; k++) {
      const nx = x + dx * k;
      const ny = y + dy * k;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) return null;
      const j = ny * w + nx;
      if (solid[j]) return { x: nx, y: ny, k, h: height[j], pal: pal[j] };
      if (floor[j] !== FLOOR_STREET && floor[j] !== FLOOR_SIDEWALK) return null;
    }
    return null;
  }

  function hostAt(x, y, gx, gy) {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return null;
    const i = y * w + x;
    if (solid[i] || (floor[i] !== FLOOR_STREET && floor[i] !== FLOOR_SIDEWALK)) return null;
    const a = firstWall(x, y, gx, gy);
    const b = firstWall(x, y, -gx, -gy);
    if (!a || !b) return null;
    if (Math.abs(a.h - b.h) > 1.8) return null;
    return { a, b };
  }

  function tryMarkSpan(c) {
    const kind = c.ew ? 1 : 2;
    const gx = kind === 1 ? 1 : 0;
    const gy = kind === 1 ? 0 : 1;
    const ax = kind === 1 ? 0 : 1;
    const ay = kind === 1 ? 1 : 0;
    const mid = hostAt(c.x, c.y, gx, gy);
    if (!mid) return false;

    let tLo = 0;
    let tHi = 0;
    while (tHi < 3 && hostAt(c.x + (tHi + 1) * ax, c.y + (tHi + 1) * ay, gx, gy)) tHi++;
    while (tLo > -3 && hostAt(c.x + (tLo - 1) * ax, c.y + (tLo - 1) * ay, gx, gy)) tLo--;
    if (tHi < tLo) return false;

    if (tHi - tLo > 1) {
      const midT = (tLo + tHi) * 0.5;
      let lo = Math.round(midT - 0.5);
      let hi = lo + 1;
      if (lo < tLo) {
        lo = tLo;
        hi = Math.min(tHi, tLo + 1);
      }
      if (hi > tHi) {
        hi = tHi;
        lo = Math.max(tLo, tHi - 1);
      }
      tLo = lo;
      tHi = hi;
    }

    let x0;
    let x1;
    let y0;
    let y1;
    if (kind === 1) {
      x0 = Math.min(mid.a.x, mid.b.x) + 1;
      x1 = Math.max(mid.a.x, mid.b.x) - 1;
      y0 = c.y + tLo;
      y1 = c.y + tHi;
    } else {
      y0 = Math.min(mid.a.y, mid.b.y) + 1;
      y1 = Math.max(mid.a.y, mid.b.y) - 1;
      x0 = c.x + tLo;
      x1 = c.x + tHi;
    }
    if (x1 < x0 || y1 < y0) return false;
    if (x0 < 1 || y0 < 1 || x1 >= w - 1 || y1 >= h - 1) return false;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (solid[i] || bridge[i]) return false;
        if (floor[i] !== FLOOR_STREET && floor[i] !== FLOOR_SIDEWALK) return false;
        if (!hostAt(x, y, gx, gy)) return false;
      }
    }

    const host = Math.min(mid.a.h, mid.b.h);
    const z1 = host - 0.28;
    const z0 = z1 - 0.62;
    if (z0 < 2.9 || z1 > host - 0.18) return false;
    const palA = mid.a.h <= mid.b.h ? mid.a.pal : mid.b.pal;
    const style = { pal: palA, pat: c.pat, z0, z1 };

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) paintCell(y * w + x, style, kind);
    }
    spans.push({ x0, y0, x1, y1, z0, z1, kind, pal: palA, pat: c.pat });
    return true;
  }

  const picked = [];
  let nEw = 0;
  let nNs = 0;
  for (let s = 0; s < seeds.length && picked.length < 6; s++) {
    const c = seeds[s];
    if (c.ew && nEw >= nNs + 1 && picked.length < 5) continue;
    if (!c.ew && nNs >= nEw + 1 && picked.length < 5) continue;
    let near = false;
    for (let p = 0; p < picked.length; p++) {
      const dx = c.x - picked[p].x;
      const dy = c.y - picked[p].y;
      if (dx * dx + dy * dy < 144) {
        near = true;
        break;
      }
    }
    if (near) continue;
    if (tryMarkSpan(c)) {
      picked.push(c);
      if (c.ew) nEw++;
      else nNs++;
    }
  }

  return {
    seed: seedStr,
    numericSeed,
    w,
    h,
    solid,
    floor,
    height,
    pal,
    pattern,
    neon,
    foliage,
    bldg,
    roof,
    spawnX,
    spawnY,
    spawnYaw,
    plazaX,
    plazaY,
    bridge,
    bridgePal,
    bridgePat,
    bridgeLo,
    bridgeHi,
    spans,
  };
}

export function isSolidAt(map, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return true;
  return map.solid[iy * map.w + ix] !== 0;
}

export function floorAt(map, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return -1;
  const i = iy * map.w + ix;
  if (map.solid[i]) return -1;
  return map.floor[i];
}