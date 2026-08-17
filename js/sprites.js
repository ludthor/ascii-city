import { mulberry32 } from "./rng.js";
import { C, DIM_OF } from "./display.js";
import { FLOOR_ALLEY, FLOOR_PARK, FLOOR_PLAZA, FLOOR_SIDEWALK, FLOOR_STREET } from "./city.js";
import { glyphLit } from "./glyphs.js";

export const KIND_SIGN = 0;
export const KIND_SIGNAL = 1;
export const KIND_CAR = 2;
export const KIND_PED = 3;
export const KIND_BEAM = 4;
export const KIND_TREE = 5;
export const KIND_VENDOR = 6;
export const KIND_DUMPSTER = 7;
export const KIND_STATUE = 8;

export const VENDOR_LABELS = ["RAMEN", "ATM", "TAXI"];

export const SIGN_LABELS = [
  "BAR",
  "RAMEN",
  "OPEN",
  "24H",
  "NET",
  "CLUB",
  "PHARM",
  "CAFE",
  "ATM",
  "VOID",
  "LOAN",
  "TAXI",
];

const PED_YIELD_R = 0.45;
const CAR_BRAKE_AHEAD = 2.2;
const CAR_BRAKE_HALF = 0.6;
const SIGNAL_AHEAD = 3.2;
const SIGNAL_HALF = 1.15;
const HONK_COOLDOWN = 2;

const CH = {
  o: 111,
  O: 79,
  eq: 61,
  dash: 45,
  pipe: 124,
  slash: 47,
  back: 92,
  pct: 37,
  hash: 35,
  plus: 43,
  X: 88,
  z: 122,
  dot: 46,
  colon: 58,
  I: 73,
  tilde: 126,
  star: 42,
};

function floorCell(map, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return -1;
  const i = iy * map.w + ix;
  if (map.solid[i]) return -1;
  return map.floor[i];
}

function shuffle(rng, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

function dist2(x, y, ox, oy) {
  const dx = x - ox;
  const dy = y - oy;
  return dx * dx + dy * dy;
}

function headingAlongStreet(map, x, y) {
  const runE = openRun(map, x, y, 1, 0);
  const runW = openRun(map, x, y, -1, 0);
  const runS = openRun(map, x, y, 0, 1);
  const runN = openRun(map, x, y, 0, -1);
  const horiz = Math.max(runE, runW);
  const vert = Math.max(runS, runN);
  if (vert > horiz) return runS >= runN ? Math.PI * 0.5 : -Math.PI * 0.5;
  return runE >= runW ? 0 : Math.PI;
}

function openRun(map, x, y, dx, dy) {
  let n = 0;
  let cx = x + dx;
  let cy = y + dy;
  while (n < 10 && floorCell(map, cx, cy) === FLOOR_STREET) {
    n++;
    cx += dx;
    cy += dy;
  }
  return n;
}

function pinToFacade(map, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let d = 0; d < 4; d++) {
    const dx = dirs[d][0];
    const dy = dirs[d][1];
    const nx = ix + dx;
    const ny = iy + dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    if (!map.solid[ny * map.w + nx]) continue;
    return {
      x: ix + 0.5 + dx * 0.42,
      y: iy + 0.5 + dy * 0.42,
      faceX: -dx,
      faceY: -dy,
      ok: true,
    };
  }
  return { x, y, ok: false };
}

function parkPathNeighbor(map, x, y) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let d = 0; d < 4; d++) {
    const nx = x + dirs[d][0];
    const ny = y + dirs[d][1];
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    const i = ny * map.w + nx;
    if (!map.solid[i] && map.floor[i] === FLOOR_PARK && !map.foliage[i]) return true;
  }
  return false;
}

function signalPhase(s, time) {
  return ((time * 0.35 + s.phase) | 0) % 3;
}

function groupSignalPhases(sprites) {
  const list = [];
  for (let i = 0; i < sprites.length; i++) {
    if (sprites[i].kind === KIND_SIGNAL) list.push(sprites[i]);
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = 0; j < i; j++) {
      if (dist2(list[i].x, list[i].y, list[j].x, list[j].y) < 6.8) {
        list[i].phase = list[j].phase;
        break;
      }
    }
  }
}

function carAhead(sprites, car, selfIdx) {
  const hx = Math.cos(car.heading);
  const hy = Math.sin(car.heading);
  for (let i = 0; i < sprites.length; i++) {
    if (i === selfIdx) continue;
    const o = sprites[i];
    if (o.kind !== KIND_CAR || o.speed <= 0) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const ahead = dx * hx + dy * hy;
    const side = Math.abs(-hy * dx + hx * dy);
    if (ahead > 0.15 && ahead < CAR_BRAKE_AHEAD && side < CAR_BRAKE_HALF) return true;
  }
  return false;
}

function redLightAhead(sprites, car, time) {
  const hx = Math.cos(car.heading);
  const hy = Math.sin(car.heading);
  let best = SIGNAL_AHEAD;
  let stop = false;
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (s.kind !== KIND_SIGNAL) continue;
    const dx = s.x - car.x;
    const dy = s.y - car.y;
    const ahead = dx * hx + dy * hy;
    const side = Math.abs(-hy * dx + hx * dy);
    if (ahead > 0.2 && ahead < best && side < SIGNAL_HALF) {
      best = ahead;
      const phase = signalPhase(s, time);
      stop = phase === 0 || phase === 1;
    }
  }
  return stop;
}

function curbNudge(map, x, y) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let d = 0; d < 4; d++) {
    const dx = dirs[d][0];
    const dy = dirs[d][1];
    if (floorCell(map, x + dx, y + dy) === FLOOR_SIDEWALK) {
      return { ox: dx * 0.28, oy: dy * 0.28 };
    }
  }
  return { ox: 0, oy: 0 };
}

function nearHalt(sprites, map, s) {
  const ix = Math.floor(s.x);
  const iy = Math.floor(s.y);
  if (ix >= 0 && iy >= 0 && ix < map.w && iy < map.h) {
    const i = iy * map.w + ix;
    if (!map.solid[i] && map.floor[i] === FLOOR_PARK && !map.foliage[i]) return true;
    if (!map.solid[i] && map.floor[i] === FLOOR_PLAZA) return true;
  }
  for (let i = 0; i < sprites.length; i++) {
    const o = sprites[i];
    if (o === s) continue;
    if (o.kind !== KIND_SIGN && o.kind !== KIND_VENDOR && o.kind !== KIND_STATUE) continue;
    if (dist2(s.x, s.y, o.x, o.y) < 1.2) return true;
  }
  return false;
}

function solidAhead(map, x, y, dx, dy) {
  for (let k = 1; k <= 3; k++) {
    const nx = x + dx * k;
    const ny = y + dy * k;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) return false;
    if (map.solid[ny * map.w + nx]) return true;
  }
  return false;
}

function pedWalkable(fl) {
  return fl === FLOOR_SIDEWALK || fl === FLOOR_PARK || fl === FLOOR_ALLEY || fl === FLOOR_PLAZA;
}

function steerToward(map, s, tx, ty) {
  if (!pedWalkable(floorCell(map, s.x, s.y))) {
    const escape = [
      [1, 0, 0],
      [-1, 0, Math.PI],
      [0, 1, Math.PI * 0.5],
      [0, -1, -Math.PI * 0.5],
    ];
    for (let i = 0; i < 4; i++) {
      if (pedWalkable(floorCell(map, s.x + escape[i][0] * 0.7, s.y + escape[i][1] * 0.7))) {
        s.heading = escape[i][2];
        return;
      }
    }
  }
  const dx = tx - s.x;
  const dy = ty - s.y;
  if (dx * dx + dy * dy < 0.04) return;
  const ax = dx >= 0 ? 1 : -1;
  const ay = dy >= 0 ? 1 : -1;
  const xFirst = Math.abs(dx) >= Math.abs(dy);
  const tries = xFirst
    ? [
        [ax, 0, ax > 0 ? 0 : Math.PI],
        [0, ay, ay > 0 ? Math.PI * 0.5 : -Math.PI * 0.5],
      ]
    : [
        [0, ay, ay > 0 ? Math.PI * 0.5 : -Math.PI * 0.5],
        [ax, 0, ax > 0 ? 0 : Math.PI],
      ];
  for (let i = 0; i < tries.length; i++) {
    const sx = tries[i][0];
    const sy = tries[i][1];
    const near = pedWalkable(floorCell(map, s.x + sx * 0.4, s.y + sy * 0.4));
    const far = pedWalkable(floorCell(map, s.x + sx * 1.05, s.y + sy * 1.05));
    if (near && far) {
      s.heading = tries[i][2];
      return;
    }
  }
}

function blockedByProp(sprites, x, y, skip, radius) {
  const r2 = radius * radius;
  for (let i = 0; i < sprites.length; i++) {
    if (i === skip) continue;
    const t = sprites[i];
    if (t.kind !== KIND_TREE && t.kind !== KIND_DUMPSTER && t.kind !== KIND_STATUE && t.kind !== KIND_VENDOR)
      continue;
    const dx = x - t.x;
    const dy = y - t.y;
    if (dx * dx + dy * dy < r2) return true;
  }
  return false;
}

function takeNearThenFar(rng, cells, spawnX, spawnY, nearR, nearN, farN) {
  const near = [];
  const far = [];
  const r2 = nearR * nearR;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (dist2(c.x + 0.5, c.y + 0.5, spawnX, spawnY) <= r2) near.push(c);
    else far.push(c);
  }
  shuffle(rng, near);
  shuffle(rng, far);
  return near.slice(0, nearN).concat(far.slice(0, farN));
}

export function generateSprites(map) {
  const rng = mulberry32(map.numericSeed ^ 0xc0ffee);
  const sprites = [];
  const w = map.w;
  const h = map.h;
  const spawnX = map.spawnX;
  const spawnY = map.spawnY;

  const streets = [];
  const sidewalks = [];
  const parks = [];
  const grass = [];
  const alleys = [];
  const plazas = [];
  const crosses = [];
  const cableCells = [];

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (map.solid[i]) continue;
      const fl = map.floor[i];
      if (fl === FLOOR_STREET) {
        streets.push({ x, y });
        const ew =
          floorCell(map, x - 1, y) === FLOOR_STREET &&
          floorCell(map, x + 1, y) === FLOOR_STREET;
        const ns =
          floorCell(map, x, y - 1) === FLOOR_STREET &&
          floorCell(map, x, y + 1) === FLOOR_STREET;
        if (ew && ns) crosses.push({ x, y });
        const wallE = solidAhead(map, x, y, 1, 0);
        const wallW = solidAhead(map, x, y, -1, 0);
        const wallS = solidAhead(map, x, y, 0, 1);
        const wallN = solidAhead(map, x, y, 0, -1);
        if ((wallE && wallW) || (wallN && wallS)) cableCells.push({ x, y, ew: wallE && wallW });
      } else if (fl === FLOOR_SIDEWALK) sidewalks.push({ x, y });
      else if (fl === FLOOR_PARK) {
        parks.push({ x, y });
        if (map.foliage[i]) grass.push({ x, y });
      } else if (fl === FLOOR_ALLEY) alleys.push({ x, y });
      else if (fl === FLOOR_PLAZA) plazas.push({ x, y });
    }
  }

  const signalCells = takeNearThenFar(rng, crosses, spawnX, spawnY, 14, 6, 10);
  for (let i = 0; i < signalCells.length; i++) {
    const c = signalCells[i];
    sprites.push({
      kind: KIND_SIGNAL,
      x: c.x + 0.18,
      y: c.y + 0.18,
      z: 0,
      sprW: 0.16,
      sprH: 1.15,
      phase: rng() * 10,
      color: C.RED,
      heading: 0,
      speed: 0,
    });
  }
  groupSignalPhases(sprites);

  const signCells = takeNearThenFar(rng, sidewalks, spawnX, spawnY, 12, 14, 18);
  for (let i = 0; i < signCells.length; i++) {
    const c = signCells[i];
    const pos = pinToFacade(map, c.x + 0.5, c.y + 0.5);
    if (!pos.ok) continue;
    sprites.push({
      kind: KIND_SIGN,
      x: pos.x,
      y: pos.y,
      z: 0.88,
      sprW: 0.85,
      sprH: 0.48,
      phase: rng() * 8,
      color: rng() < 0.45 ? C.MAGENTA : rng() < 0.5 ? C.YELLOW : C.CYAN,
      heading: 0,
      speed: 0,
      label: SIGN_LABELS[(rng() * SIGN_LABELS.length) | 0],
      faceX: pos.faceX,
      faceY: pos.faceY,
    });
  }

  if (map.plazaX) {
    const plazaWalk = sidewalks.filter(
      (c) => dist2(c.x + 0.5, c.y + 0.5, map.plazaX, map.plazaY) < 16
    );
    const extraSigns = takeNearThenFar(rng, plazaWalk, map.plazaX, map.plazaY, 6, 6, 4);
    for (let i = 0; i < extraSigns.length; i++) {
      const c = extraSigns[i];
      const pos = pinToFacade(map, c.x + 0.5, c.y + 0.5);
      if (!pos.ok) continue;
      sprites.push({
        kind: KIND_SIGN,
        x: pos.x,
        y: pos.y,
        z: 0.88,
        sprW: 0.85,
        sprH: 0.48,
        phase: rng() * 8,
        color: rng() < 0.5 ? C.MAGENTA : C.YELLOW,
        heading: 0,
        speed: 0,
        label: SIGN_LABELS[(rng() * SIGN_LABELS.length) | 0],
        faceX: pos.faceX,
        faceY: pos.faceY,
      });
    }
  }

  const vendorCells = takeNearThenFar(rng, sidewalks, spawnX, spawnY, 12, 5, 6);
  for (let i = 0; i < vendorCells.length; i++) {
    const c = vendorCells[i];
    const pos = pinToFacade(map, c.x + 0.5, c.y + 0.5);
    if (!pos.ok) continue;
    sprites.push({
      kind: KIND_VENDOR,
      x: pos.x + pos.faceX * 0.22,
      y: pos.y + pos.faceY * 0.22,
      z: 0,
      sprW: 0.72,
      sprH: 0.7,
      phase: rng() * 8,
      color: rng() < 0.5 ? C.ORANGE : C.YELLOW,
      heading: 0,
      speed: 0,
      label: VENDOR_LABELS[(rng() * VENDOR_LABELS.length) | 0],
      faceX: pos.faceX,
      faceY: pos.faceY,
    });
  }

  const spawnClear2 = 2.4 * 2.4;
  const carCells = takeNearThenFar(rng, streets, spawnX, spawnY, 14, 14, 20);
  for (let i = 0; i < carCells.length; i++) {
    const c = carCells[i];
    if (dist2(c.x + 0.5, c.y + 0.5, spawnX, spawnY) < spawnClear2) continue;
    const heading = headingAlongStreet(map, c.x, c.y);
    sprites.push({
      kind: KIND_CAR,
      x: c.x + 0.5,
      y: c.y + 0.5,
      z: 0,
      sprW: 1.15,
      sprH: 0.42,
      phase: rng(),
      color: rng() < 0.4 ? C.CYAN : rng() < 0.5 ? C.AMBER : C.ORANGE,
      heading,
      speed: 1.8 + rng() * 1.8,
      turn: rng() < 0.5 ? 1 : -1,
      braking: false,
      honkCd: 0,
    });
  }

  const crossSet = new Set();
  for (let i = 0; i < crosses.length; i++) crossSet.add(crosses[i].x + "," + crosses[i].y);
  const usedStreet = new Set();
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (s.kind !== KIND_CAR) continue;
    usedStreet.add((s.x | 0) + "," + (s.y | 0));
  }
  const curb = [];
  for (let i = 0; i < streets.length; i++) {
    const c = streets[i];
    const key = c.x + "," + c.y;
    if (crossSet.has(key) || usedStreet.has(key)) continue;
    if (dist2(c.x + 0.5, c.y + 0.5, spawnX, spawnY) < spawnClear2) continue;
    if (
      floorCell(map, c.x + 1, c.y) === FLOOR_SIDEWALK ||
      floorCell(map, c.x - 1, c.y) === FLOOR_SIDEWALK ||
      floorCell(map, c.x, c.y + 1) === FLOOR_SIDEWALK ||
      floorCell(map, c.x, c.y - 1) === FLOOR_SIDEWALK
    ) {
      curb.push(c);
    }
  }
  const parkedCells = takeNearThenFar(rng, curb, spawnX, spawnY, 12, 8, 12);
  for (let i = 0; i < parkedCells.length; i++) {
    const c = parkedCells[i];
    const nudge = curbNudge(map, c.x, c.y);
    sprites.push({
      kind: KIND_CAR,
      x: c.x + 0.5 + nudge.ox,
      y: c.y + 0.5 + nudge.oy,
      z: 0,
      sprW: 1.05,
      sprH: 0.4,
      phase: rng(),
      color: rng() < 0.35 ? C.GRAY : rng() < 0.5 ? C.BLUE : C.ORANGE,
      heading: headingAlongStreet(map, c.x, c.y),
      speed: 0,
      turn: 1,
      braking: false,
      honkCd: 0,
      parked: true,
    });
  }

  const lined = [];
  const deep = [];
  for (let i = 0; i < grass.length; i++) {
    const c = grass[i];
    if (parkPathNeighbor(map, c.x, c.y)) lined.push(c);
    else deep.push(c);
  }
  const treeCells = takeNearThenFar(rng, lined, spawnX, spawnY, 16, 8, 18).concat(
    takeNearThenFar(rng, deep, spawnX, spawnY, 16, 4, 12)
  );
  for (let i = 0; i < treeCells.length; i++) {
    const c = treeCells[i];
    if (dist2(c.x + 0.5, c.y + 0.5, spawnX, spawnY) < spawnClear2) continue;
    sprites.push({
      kind: KIND_TREE,
      x: c.x + 0.32 + rng() * 0.36,
      y: c.y + 0.32 + rng() * 0.36,
      z: 0,
      sprW: 0.36 + rng() * 0.16,
      sprH: 1.45 + rng() * 0.4,
      phase: rng() * 8,
      color: C.LIME,
      heading: 0,
      speed: 0,
    });
  }

  const dumpCells = takeNearThenFar(rng, alleys, spawnX, spawnY, 16, 3, 4);
  for (let i = 0; i < dumpCells.length; i++) {
    const c = dumpCells[i];
    sprites.push({
      kind: KIND_DUMPSTER,
      x: c.x + 0.4 + rng() * 0.2,
      y: c.y + 0.4 + rng() * 0.2,
      z: 0,
      sprW: 0.42,
      sprH: 0.38,
      phase: rng(),
      color: C.GRAY,
      heading: 0,
      speed: 0,
    });
  }

  const cablePick = takeNearThenFar(rng, cableCells, spawnX, spawnY, 12, 6, 8);
  for (let i = 0; i < cablePick.length; i++) {
    const c = cablePick[i];
    sprites.push({
      kind: KIND_BEAM,
      x: c.x + 0.5,
      y: c.y + 0.5,
      z: 2.15,
      sprW: c.ew ? 1.25 : 1.05,
      sprH: 0.16,
      phase: rng(),
      color: C.CYAN_DIM,
      heading: 0,
      speed: 0,
    });
  }

  if (map.plazaX && map.plazaY) {
    sprites.push({
      kind: KIND_STATUE,
      x: map.plazaX,
      y: map.plazaY,
      z: 0,
      sprW: 0.7,
      sprH: 1.22,
      phase: 0,
      color: C.CYAN,
      heading: 0,
      speed: 0,
    });
  }

  const pedPool = sidewalks.concat(parks, plazas);
  const pedCells = takeNearThenFar(rng, pedPool, spawnX, spawnY, 12, 22, 42);
  for (let i = 0; i < pedCells.length; i++) {
    const c = pedCells[i];
    sprites.push({
      kind: KIND_PED,
      x: c.x + 0.35 + rng() * 0.3,
      y: c.y + 0.35 + rng() * 0.3,
      z: 0,
      sprW: 0.18,
      sprH: 0.58,
      phase: rng() * 6,
      color: rng() < 0.3 ? C.WHITE : rng() < 0.5 ? C.CYAN : C.YELLOW,
      heading: rng() * Math.PI * 2,
      speed: 0.75 + rng() * 0.55,
      idle: false,
      idleT: rng() * 2,
    });
  }

  const parkPedCells = takeNearThenFar(rng, parks, spawnX, spawnY, 14, 8, 10);
  for (let i = 0; i < parkPedCells.length; i++) {
    const c = parkPedCells[i];
    sprites.push({
      kind: KIND_PED,
      x: c.x + 0.35 + rng() * 0.3,
      y: c.y + 0.35 + rng() * 0.3,
      z: 0,
      sprW: 0.18,
      sprH: 0.58,
      phase: rng() * 6,
      color: rng() < 0.4 ? C.LIME : rng() < 0.5 ? C.WHITE : C.YELLOW,
      heading: rng() * Math.PI * 2,
      speed: 0.55 + rng() * 0.4,
      idle: false,
      idleT: rng() * 2,
    });
  }

  const vendorSpots = [];
  for (let i = 0; i < sprites.length; i++) {
    if (sprites[i].kind === KIND_VENDOR) vendorSpots.push(sprites[i]);
  }
  for (let i = 0; i < vendorSpots.length && i < 8; i++) {
    const v = vendorSpots[i];
    sprites.push({
      kind: KIND_PED,
      x: v.x + (rng() - 0.5) * 0.5,
      y: v.y + (rng() - 0.5) * 0.5,
      z: 0,
      sprW: 0.18,
      sprH: 0.58,
      phase: rng() * 6,
      color: rng() < 0.4 ? C.WHITE : C.YELLOW,
      heading: rng() * Math.PI * 2,
      speed: 0.45 + rng() * 0.3,
      idle: true,
      idleT: 1.2 + rng(),
      errand: 2,
      aimX: v.x,
      aimY: v.y,
    });
  }

  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (s.kind !== KIND_PED || s.errand) continue;
    const r = rng();
    const plazaNear =
      map.plazaX && dist2(s.x, s.y, map.plazaX, map.plazaY) < 400;
    if (r < 0.38 && plazaNear) {
      s.errand = 1;
      s.aimX = map.plazaX;
      s.aimY = map.plazaY;
      s.idle = false;
    } else if (r < 0.58 && vendorSpots.length) {
      const v = vendorSpots[(rng() * vendorSpots.length) | 0];
      s.errand = 2;
      s.aimX = v.x;
      s.aimY = v.y;
      s.idle = false;
    } else {
      s.errand = 0;
    }
  }

  return sprites;
}

export function updateSprites(sprites, map, dt, night, player, time) {
  let honk = false;
  const hasPlayer = player && Number.isFinite(player.x);
  const px = hasPlayer ? player.x : 0;
  const py = hasPlayer ? player.y : 0;
  const t = Number.isFinite(time) ? time : 0;

  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (s.kind !== KIND_CAR || s.speed <= 0) continue;
    if (s.honkCd > 0) s.honkCd -= dt;
    let playerBrake = false;
    if (hasPlayer) {
      const dx = px - s.x;
      const dy = py - s.y;
      const hx = Math.cos(s.heading);
      const hy = Math.sin(s.heading);
      const ahead = dx * hx + dy * hy;
      const side = Math.abs(-hy * dx + hx * dy);
      if (ahead > 0.15 && ahead < CAR_BRAKE_AHEAD && side < CAR_BRAKE_HALF) playerBrake = true;
    }
    const lightBrake = redLightAhead(sprites, s, t);
    const carBrake = carAhead(sprites, s, i);
    const wasBraking = !!s.braking;
    s.braking = playerBrake || lightBrake || carBrake;
    if (playerBrake && !wasBraking && (s.honkCd || 0) <= 0) {
      honk = true;
      s.honkCd = HONK_COOLDOWN;
    }
  }

  const vendorList = [];
  for (let i = 0; i < sprites.length; i++) {
    if (sprites[i].kind === KIND_VENDOR) vendorList.push(sprites[i]);
  }

  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (s.kind === KIND_BEAM || s.speed <= 0) continue;
    if (s.kind === KIND_CAR && s.braking) continue;

    if (s.kind === KIND_PED) {
      s.idleT = (s.idleT || 0) - dt;
      if (s.errand && s.aimX) {
        const dAim = Math.hypot(s.aimX - s.x, s.aimY - s.y);
        if (dAim < 1.35) {
          if (!s.idle) {
            s.idle = true;
            s.idleT = 2.6 + (s.phase % 2);
          } else if (s.idleT <= 0) {
            if (s.errand === 1 && vendorList.length) {
              let best = null;
              let bestD = 400;
              for (let k = 0; k < vendorList.length; k++) {
                const v = vendorList[k];
                const d = dist2(s.x, s.y, v.x, v.y);
                if (d < bestD) {
                  bestD = d;
                  best = v;
                }
              }
              if (best) {
                s.errand = 2;
                s.aimX = best.x;
                s.aimY = best.y;
              } else s.errand = 0;
            } else if (map.plazaX && dist2(s.x, s.y, map.plazaX, map.plazaY) < 400) {
              s.errand = 1;
              s.aimX = map.plazaX;
              s.aimY = map.plazaY;
            } else {
              s.errand = 0;
            }
            s.idle = false;
            s.idleT = 5;
            if (s.errand && s.aimX) steerToward(map, s, s.aimX, s.aimY);
          }
        } else {
          s.idle = false;
          s.steerT = (s.steerT || 0) - dt;
          if (s.steerT <= 0) {
            steerToward(map, s, s.aimX, s.aimY);
            s.steerT = 0.85;
          }
        }
      } else if (s.idleT <= 0) {
        if (!s.idle && nearHalt(sprites, map, s)) {
          s.idle = true;
          s.idleT = 1.1 + (s.phase % 1);
        } else {
          s.idle = false;
          s.idleT = 2.2 + (s.phase % 2);
        }
      }
      if (s.idle) continue;
    }

    const nx = s.x + Math.cos(s.heading) * s.speed * dt;
    const ny = s.y + Math.sin(s.heading) * s.speed * dt;

    if (s.kind === KIND_PED && hasPlayer) {
      const dNext = Math.hypot(nx - px, ny - py);
      if (dNext < PED_YIELD_R) {
        s.heading = Math.atan2(s.y - py, s.x - px);
        continue;
      }
    }

    const fl = floorCell(map, nx, ny);
    const hitProp =
      s.kind === KIND_PED && blockedByProp(sprites, nx, ny, i, 0.28);
    let ok =
      !hitProp && (s.kind === KIND_CAR ? fl === FLOOR_STREET : pedWalkable(fl));
    if (ok && s.kind === KIND_PED) {
      const ax = nx + Math.cos(s.heading) * 0.4;
      const ay = ny + Math.sin(s.heading) * 0.4;
      if (!pedWalkable(floorCell(map, ax, ay))) ok = false;
    }
    if (ok) {
      s.x = nx;
      s.y = ny;
    } else if (s.kind === KIND_CAR) {
      const left = s.heading + (Math.PI / 2) * s.turn;
      const lx = s.x + Math.cos(left) * 0.55;
      const ly = s.y + Math.sin(left) * 0.55;
      if (floorCell(map, lx, ly) === FLOOR_STREET) s.heading = left;
      else s.heading += Math.PI;
    } else if (s.kind === KIND_PED && s.errand && s.aimX) {
      s.heading += (Math.PI / 2) * (s.phase > 3 ? 1 : -1);
      s.steerT = 1.15;
    } else {
      s.heading += (Math.PI / 2) * (s.phase > 3 ? 1 : -1);
    }
  }

  return { honk };
}

export function lookAtSign(sprites, cam) {
  const dirX = Math.cos(cam.yaw);
  const dirY = Math.sin(cam.yaw);
  const planeX = -dirY * cam.plane;
  const planeY = dirX * cam.plane;
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  let best = "";
  let bestScore = Infinity;
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (s.kind !== KIND_SIGN && s.kind !== KIND_VENDOR) continue;
    if (!s.label) continue;
    if (s.faceX != null) {
      if ((cam.x - s.x) * s.faceX + (cam.y - s.y) * s.faceY <= 0.08) continue;
      if (dirX * s.faceX + dirY * s.faceY > -0.2) continue;
    }
    const sx = s.x - cam.x;
    const sy = s.y - cam.y;
    const transformY = invDet * (-planeY * sx + planeX * sy);
    if (transformY <= 0.3 || transformY > 5.5) continue;
    const transformX = invDet * (dirY * sx - dirX * sy);
    const ndcX = transformX / transformY;
    if (Math.abs(ndcX) > 0.22) continue;
    const score = transformY + Math.abs(ndcX) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = s.label;
    }
  }
  return best;
}

export function nearestMovingCarDist(sprites, x, y) {
  let best = 99;
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (s.kind !== KIND_CAR || s.braking || s.speed <= 0) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < best) best = d;
  }
  return best;
}

function sampleSprite(spr, u, v, time, night) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const breath = night ? night.breath : 0.5;
  const buzz = night ? night.buzz : 0.5;
  switch (spr.kind) {
    case KIND_SIGN: {
      const faulty = ((spr.phase * 10) | 0) % 7 === 0;
      const chatter = buzz > 0.88 && faulty;
      const lit = chatter ? DIM_OF[spr.color] : breath > 0.38 ? spr.color : DIM_OF[spr.color];
      if (v > 0.82) return u > 0.4 && u < 0.6 ? (CH.pipe << 8) | C.GRAY : 0;
      if (u < 0.08 || u > 0.92) return (CH.pipe << 8) | lit;
      if (v < 0.12 || v > 0.7) return (CH.eq << 8) | lit;
      const label = spr.label || "";
      const n = label.length;
      if (n && v > 0.2 && v < 0.64) {
        const t = (u - 0.1) / 0.8;
        if (t < 0 || t > 1) return 0;
        const i = Math.min(n - 1, (t * n) | 0);
        const local = t * n - i;
        if (local < 0.08 || local > 0.94) return 0;
        const lu = (local - 0.08) / 0.86;
        const lv = (v - 0.2) / 0.44;
        if (glyphLit(label.charCodeAt(i), lu, lv)) return (CH.hash << 8) | lit;
      }
      return 0;
    }
    case KIND_SIGNAL: {
      if (u < 0.28 || u > 0.72) return 0;
      const cycle = ((time * 0.35 + spr.phase) | 0) % 3;
      if (v < 0.18) return (CH.O << 8) | (cycle === 0 ? C.RED : C.MAGENTA_DIM);
      if (v < 0.36) return (CH.O << 8) | (cycle === 1 ? C.YELLOW : C.GOLD_DIM);
      if (v < 0.54) return (CH.O << 8) | (cycle === 2 ? C.LIME : C.GREEN_DIM);
      return (CH.pipe << 8) | C.GRAY;
    }
    case KIND_CAR: {
      if (v < 0.18) {
        if (u < 0.22 || u > 0.8) return 0;
        return (CH.hash << 8) | spr.color;
      }
      if (v < 0.42) {
        if (u < 0.08 || u > 0.92) return 0;
        return (CH.colon << 8) | C.CYAN;
      }
      if (v < 0.72) {
        if (u < 0.04) return (CH.colon << 8) | (spr.braking ? C.RED : C.YELLOW);
        if (u > 0.96) return (CH.dot << 8) | C.RED;
        if (spr.braking && (u < 0.12 || u > 0.88)) return (CH.hash << 8) | C.RED;
        return (CH.eq << 8) | spr.color;
      }
      if (u < 0.18 || (u > 0.38 && u < 0.62) || u > 0.82) return (CH.o << 8) | C.GRAY;
      return 0;
    }
    case KIND_BEAM:
      if (v < 0.2 || v > 0.8) return 0;
      return (CH.tilde << 8) | (breath > 0.55 ? C.CYAN : C.CYAN_DIM);
    case KIND_VENDOR: {
      const lit = breath > 0.38 ? spr.color : DIM_OF[spr.color];
      if (v > 0.78) {
        if (u > 0.12 && u < 0.28) return (CH.o << 8) | C.GRAY;
        if (u > 0.72 && u < 0.88) return (CH.o << 8) | C.GRAY;
        return 0;
      }
      if (v > 0.34) {
        if (u < 0.06 || u > 0.94) return 0;
        return (CH.eq << 8) | lit;
      }
      const label = spr.label || "";
      const n = label.length;
      if (n && v > 0.04 && v < 0.32) {
        const t = (u - 0.08) / 0.84;
        if (t < 0 || t > 1) return 0;
        const i = Math.min(n - 1, (t * n) | 0);
        const local = t * n - i;
        if (local < 0.08 || local > 0.94) return 0;
        const lu = (local - 0.08) / 0.86;
        const lv = (v - 0.04) / 0.28;
        if (glyphLit(label.charCodeAt(i), lu, lv)) return (CH.hash << 8) | lit;
      }
      return 0;
    }
    case KIND_DUMPSTER:
      if (u < 0.08 || u > 0.92) return 0;
      if (v < 0.12) return (CH.hash << 8) | C.GRAY;
      if (v > 0.82) return (CH.eq << 8) | C.GRAY;
      return (CH.hash << 8) | C.GRAY;
    case KIND_STATUE: {
      const cx = u - 0.5;
      const t = time || 0;
      const spray = breath > 0.5 ? C.WHITE : C.CYAN;
      const half = 0.07 + (1 - v) * (1 - v) * 0.48;
      if (v > 0.18 && Math.abs(cx) < 0.04) {
        const ch = v > 0.88 ? CH.colon : CH.pipe;
        return (ch << 8) | (breath > 0.45 ? C.CYAN : C.CYAN_DIM);
      }
      if (v < 0.78 && Math.abs(cx) < half) {
        const edge = Math.abs(Math.abs(cx) - half) < 0.07;
        const flick = ((u * 29 + v * 17 + ((t * 12 + spr.phase) | 0)) | 0) & 15;
        if (edge ? flick < 11 : flick < 4) {
          const ch = flick & 4 ? CH.star : flick & 2 ? CH.dot : CH.tilde;
          return (ch << 8) | (flick & 8 ? spray : C.CYAN);
        }
      }
      return 0;
    }
    case KIND_TREE: {
      const cx = u - 0.5;
      if (v < 0.64) {
        const rx = cx / 0.38;
        const ry = (v - 0.28) / 0.30;
        if (rx * rx + ry * ry <= 1) {
          const leaf = ((u * 17 + v * 11 + spr.phase) | 0) % 3;
          const ch = leaf === 0 ? CH.O : leaf === 1 ? CH.o : CH.pct;
          const col = leaf === 2 ? C.GREEN_DIM : C.LIME;
          return (ch << 8) | col;
        }
      }
      if (v > 0.5 && Math.abs(cx) < 0.07) return (CH.pipe << 8) | C.GRAY;
      return 0;
    }
    case KIND_PED: {
      const walk = spr.idle ? 0 : ((time * 7 + spr.phase) | 0) % 2;
      if (v < 0.2) {
        return u > 0.32 && u < 0.68 ? (CH.o << 8) | spr.color : 0;
      }
      if (v < 0.58) {
        return u > 0.38 && u < 0.62 ? (CH.I << 8) | spr.color : 0;
      }
      if (walk) {
        if (u > 0.12 && u < 0.42) return (CH.slash << 8) | spr.color;
        if (u > 0.58 && u < 0.88) return (CH.back << 8) | spr.color;
        return 0;
      }
      return u > 0.38 && u < 0.62 ? (CH.pipe << 8) | spr.color : 0;
    }
    default:
      return (CH.plus << 8) | C.WHITE;
  }
}

function drawOrientedSign(s, cam, display, time, night, dirX, dirY, planeX, planeY, invDet, horizon, eye) {
  const toCamX = cam.x - s.x;
  const toCamY = cam.y - s.y;
  if (toCamX * s.faceX + toCamY * s.faceY <= 0.05) return;

  const cols = display.cols;
  const rows = display.rows;
  const chars = display.chars;
  const colors = display.colors;
  const colZ = display.colZ;
  const half = s.sprW * 0.5;
  const rx0 = s.faceY;
  const ry0 = -s.faceX;
  const towardRight = rx0 * planeX + ry0 * planeY;
  const rx = towardRight < 0 ? -rx0 : rx0;
  const ry = towardRight < 0 ? -ry0 : ry0;

  function project(wx, wy) {
    const sx = wx - cam.x;
    const sy = wy - cam.y;
    return {
      tx: invDet * (dirY * sx - dirX * sy),
      ty: invDet * (-planeY * sx + planeX * sy),
    };
  }

  let a = project(s.x - rx * half, s.y - ry * half);
  let b = project(s.x + rx * half, s.y + ry * half);
  let u0 = 0;
  let u1 = 1;
  const near = 0.18;
  if (a.ty < near && b.ty < near) return;
  if (a.ty < near) {
    const t = (near - a.ty) / (b.ty - a.ty);
    a.tx += t * (b.tx - a.tx);
    a.ty = near;
    u0 += t * (u1 - u0);
  } else if (b.ty < near) {
    const t = (near - b.ty) / (a.ty - b.ty);
    b.tx += t * (a.tx - b.tx);
    b.ty = near;
    u1 += t * (u0 - u1);
  }

  const xL = (cols / 2) * (1 + a.tx / a.ty);
  const xR = (cols / 2) * (1 + b.tx / b.ty);
  const span = xR - xL;
  if (Math.abs(span) < 0.6) return;

  let x0 = Math.floor(Math.min(xL, xR));
  let x1 = Math.ceil(Math.max(xL, xR)) - 1;
  if (x1 < x0) return;
  x0 = Math.max(0, x0);
  x1 = Math.min(cols - 1, x1);

  const invYL = 1 / a.ty;
  const invYR = 1 / b.ty;
  const uoL = u0 * invYL;
  const uoR = u1 * invYR;

  for (let x = x0; x <= x1; x++) {
    const f = (x + 0.5 - xL) / span;
    if (f < 0 || f > 1) continue;
    const invY = invYL + f * (invYR - invYL);
    const depth = 1 / invY;
    if (depth >= colZ[x] - 0.02) continue;
    const u = (uoL + f * (uoR - uoL)) * depth;
    const top = horizon - ((s.z + s.sprH - eye) * rows) / depth;
    const bot = horizon - ((s.z - eye) * rows) / depth;
    const spriteH = bot - top;
    if (spriteH < 0.7) continue;
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(rows - 1, Math.ceil(bot) - 1);
    if (y1 < y0) continue;
    const dim = depth > 12;
    for (let y = y0; y <= y1; y++) {
      const v = (y + 0.5 - top) / spriteH;
      const packed = sampleSprite(s, u, v, time, night);
      if (!packed) continue;
      let ch = packed >> 8;
      let ci = packed & 255;
      if (dim) ci = DIM_OF[ci];
      const idx = y * cols + x;
      chars[idx] = ch;
      colors[idx] = ci;
    }
  }
}

export function drawSprites(sprites, cam, display, time, night) {
  const cols = display.cols;
  const rows = display.rows;
  const chars = display.chars;
  const colors = display.colors;
  const colZ = display.colZ;
  if (!colZ || colZ.length !== cols) return;
  const horizon = rows * 0.5 + cam.pitch * rows * 0.5;
  const dirX = Math.cos(cam.yaw);
  const dirY = Math.sin(cam.yaw);
  const planeX = -dirY * cam.plane;
  const planeY = dirX * cam.plane;
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  const eye = cam.eye;

  const vis = [];
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    const sx = s.x - cam.x;
    const sy = s.y - cam.y;
    const transformY = invDet * (-planeY * sx + planeX * sy);
    if (transformY <= 0.18 || transformY > 28) continue;
    const transformX = invDet * (dirY * sx - dirX * sy);
    vis.push({ s, transformX, transformY });
  }
  vis.sort((a, b) => b.transformY - a.transformY);

  for (let i = 0; i < vis.length; i++) {
    const { s, transformX, transformY } = vis[i];
    if (s.kind === KIND_SIGN && s.faceX != null) {
      drawOrientedSign(s, cam, display, time, night, dirX, dirY, planeX, planeY, invDet, horizon, eye);
      continue;
    }
    const screenX = (cols / 2) * (1 + transformX / transformY);
    const top = horizon - ((s.z + s.sprH - eye) * rows) / transformY;
    const bot = horizon - ((s.z - eye) * rows) / transformY;
    const spriteH = bot - top;
    if (spriteH < (s.kind === KIND_BEAM ? 0.25 : 0.7)) continue;
    const spriteW = Math.max((s.sprW / s.sprH) * spriteH, spriteH >= 2 ? 1 : 0.6);
    let x0 = Math.floor(screenX - spriteW / 2);
    let x1 = Math.ceil(screenX + spriteW / 2) - 1;
    if (x1 < x0) x1 = x0;
    x0 = Math.max(0, x0);
    x1 = Math.min(cols - 1, x1);
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(rows - 1, Math.ceil(bot) - 1);
    if (y1 < y0) continue;
    const dim = transformY > 12;

    for (let x = x0; x <= x1; x++) {
      if (transformY >= colZ[x] - 0.02) continue;
      const u = (x + 0.5 - (screenX - spriteW / 2)) / spriteW;
      for (let y = y0; y <= y1; y++) {
        const v = (y + 0.5 - top) / spriteH;
        const packed = sampleSprite(s, u, v, time, night);
        if (!packed) continue;
        let ch = packed >> 8;
        let ci = packed & 255;
        if (dim) ci = DIM_OF[ci];
        const idx = y * cols + x;
        chars[idx] = ch;
        colors[idx] = ci;
      }
    }
  }

  drawHeadlightCones(sprites, cam, display, night, dirX, dirY, planeX, planeY, invDet, horizon, eye);
}

function drawHeadlightCones(sprites, cam, display, night, dirX, dirY, planeX, planeY, invDet, horizon, eye) {
  const cols = display.cols;
  const rows = display.rows;
  const chars = display.chars;
  const colors = display.colors;
  const colZ = display.colZ;
  const breath = night ? night.breath : 0.5;
  const hot = breath > 0.4;

  for (let i = 0; i < sprites.length; i++) {
    const car = sprites[i];
    if (car.kind !== KIND_CAR) continue;
    const hx = Math.cos(car.heading);
    const hy = Math.sin(car.heading);
    const px = -hy;
    const py = hx;
    const reach = 1.9 + breath * 0.5;

    for (let t = 0.4; t < reach; t += 0.2) {
      const halfW = 0.08 + t * 0.18;
      const fade = 1 - t / reach;
      for (let s = -halfW; s <= halfW; s += 0.13) {
        const wx = car.x + hx * t + px * s;
        const wy = car.y + hy * t + py * s;
        const dx = wx - cam.x;
        const dy = wy - cam.y;
        const transformY = invDet * (-planeY * dx + planeX * dy);
        if (transformY <= 0.2 || transformY > 14) continue;
        const transformX = invDet * (dirY * dx - dirX * dy);
        const screenX = ((cols / 2) * (1 + transformX / transformY)) | 0;
        if (screenX < 0 || screenX >= cols) continue;
        if (transformY >= colZ[screenX] - 0.05) continue;
        const screenY = (horizon + (eye * rows) / transformY) | 0;
        if (screenY < 0 || screenY >= rows) continue;
        const edge = Math.abs(s) > halfW * 0.58;
        const idx = screenY * cols + screenX;
        chars[idx] = fade > 0.5 && !edge ? 58 : 46;
        let ci = C.GOLD_DIM;
        if (hot && fade > 0.35) ci = edge ? C.AMBER : C.YELLOW;
        if (hot && fade > 0.72 && Math.abs(s) < 0.07) ci = C.WHITE;
        colors[idx] = ci;
      }
    }
  }
}
