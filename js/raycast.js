import { hash2 } from "./rng.js";
import { C, DIM_OF } from "./display.js";
import { FLOOR_ALLEY, FLOOR_PARK, FLOOR_PLAZA, FLOOR_SIDEWALK, FLOOR_STREET, floorAt } from "./city.js";
import { glyphLit, BOARD_WORDS } from "./glyphs.js";

const ROOF_MAST = 1;
const ROOF_DISH = 2;
const ROOF_BOARD = 3;

const MAX_STEPS = 96;
const FOG_START = 10;
const FOG_END = 36;
const FOG_ALLEY_START = 1.8;
const FOG_ALLEY_END = 11;

let fogStart = FOG_START;
let fogEnd = FOG_END;
let fogAlley = false;
let fogPlaza = false;

const CH = {
  space: 32,
  dot: 46,
  colon: 58,
  dash: 45,
  eq: 61,
  pipe: 124,
  o: 111,
  O: 79,
  zero: 48,
  eight: 56,
  X: 88,
  x: 120,
  z: 122,
  Z: 90,
  H: 72,
  M: 77,
  pct: 37,
  star: 42,
  plus: 43,
  tilde: 126,
  hash: 35,
};

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function rayAabb2d(px, py, dx, dy, x0, y0, x1, y1) {
  const minX = x0;
  const maxX = x1 + 1;
  const minY = y0;
  const maxY = y1 + 1;
  let tEnter = -1e9;
  let tExit = 1e9;
  let sideNear = 0;
  let sideFar = 0;
  if (Math.abs(dx) < 1e-8) {
    if (px < minX || px >= maxX) return null;
  } else {
    let t0 = (minX - px) / dx;
    let t1 = (maxX - px) / dx;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tEnter) {
      tEnter = t0;
      sideNear = 0;
    }
    if (t1 < tExit) {
      tExit = t1;
      sideFar = 0;
    }
  }
  if (Math.abs(dy) < 1e-8) {
    if (py < minY || py >= maxY) return null;
  } else {
    let t0 = (minY - py) / dy;
    let t1 = (maxY - py) / dy;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tEnter) {
      tEnter = t0;
      sideNear = 1;
    }
    if (t1 < tExit) {
      tExit = t1;
      sideFar = 1;
    }
  }
  if (tExit < tEnter || tExit < 0.05) return null;
  return { tNear: Math.max(0, tEnter), tFar: tExit, sideNear, sideFar };
}

function spanAbutment(spans, mapX, mapY, side) {
  if (!spans) return null;
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (side === 0 && s.kind === 1 && mapY >= s.y0 && mapY <= s.y1) {
      if (mapX === s.x0 - 1 || mapX === s.x1 + 1) return s;
    }
    if (side === 1 && s.kind === 2 && mapX >= s.x0 && mapX <= s.x1) {
      if (mapY === s.y0 - 1 || mapY === s.y1 + 1) return s;
    }
  }
  return null;
}

function sampleSpanSkin(span, u, worldZ, dist, night) {
  const pal = span.pal || C.CYAN;
  const t = (worldZ - span.z0) / (span.z1 - span.z0 || 1);
  const breath = night ? night.breath : 0.5;
  const neon = breath > 0.58 ? pal : breath > 0.3 ? DIM_OF[pal] || pal : C.GRAY;
  if (t < 0.13 || t > 0.87) {
    return (CH.eq << 8) | fogColor(neon, dist);
  }
  const bay = u * 5;
  const uu = bay - (bay | 0);
  if (uu < 0.1 || uu > 0.9) {
    return (CH.pipe << 8) | fogColor(DIM_OF[pal] || pal, dist);
  }
  const h = hash2(0x62, (u * 13) | 0, (worldZ * 7) | 0);
  if ((h & 15) < 3) {
    const lit = breath > 0.42 ? (h & 4 ? C.WHITE : pal) : DIM_OF[pal] || pal;
    return ((h & 2 ? CH.o : CH.colon) << 8) | fogColor(lit, dist);
  }
  return (CH.colon << 8) | fogColor(C.BLUE_DEEP, dist);
}

function sampleAbutment(span, u, worldZ, dist, night) {
  if (u < 0.1 || u > 0.9) return 0;
  const pal = span.pal || C.CYAN;
  const t = (worldZ - span.z0) / (span.z1 - span.z0 || 1);
  if (t < 0 || t > 1) return 0;
  const breath = night ? night.breath : 0.5;
  const neon = breath > 0.55 ? pal : DIM_OF[pal] || pal;
  if (t < 0.12 || t > 0.88 || u < 0.18 || u > 0.82) {
    return (CH.eq << 8) | fogColor(neon, dist);
  }
  return (CH.hash << 8) | fogColor(C.BLUE_DEEP, dist);
}

function faceU(side, posX, posY, rayDirX, rayDirY, dist) {
  let u = side === 0 ? posY + dist * rayDirY : posX + dist * rayDirX;
  u -= Math.floor(u);
  if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) u = 1 - u;
  return u;
}

function paintSpanFace(chars, colors, cols, rows, horizon, eye, dist, night, x, span, u, portal) {
  if (dist < 0.55 || dist > fogEnd) return;
  const top = horizon - ((span.z1 - eye) * rows) / dist;
  const bot = horizon - ((span.z0 - eye) * rows) / dist;
  const y0 = Math.max(0, top | 0);
  const y1 = Math.min(rows - 1, bot | 0);
  if (y1 < y0) return;
  for (let y = y0; y <= y1; y++) {
    const worldZ = eye + ((horizon - y) * dist) / rows;
    const packed = portal
      ? sampleAbutment(span, u, worldZ, dist, night)
      : sampleSpanSkin(span, u, worldZ, dist, night);
    if (!packed) continue;
    const idx = y * cols + x;
    chars[idx] = packed >> 8;
    colors[idx] = packed & 255;
  }
}

function drawSpanBox(chars, colors, cols, rows, horizon, eye, night, x, posX, posY, rayDirX, rayDirY, wallDist, span, hit) {
  const near = Math.max(0.55, hit.tNear);
  const far = Math.min(hit.tFar, wallDist, fogEnd);
  if (far <= near) return;
  const breath = night ? night.breath : 0.5;

  const zOff = span.z0 - eye;
  if (zOff > 0.05) {
    const yEnd = Math.min(rows - 1, (horizon + 2) | 0);
    for (let y = 0; y <= yEnd; y++) {
      const denom = horizon - y;
      if (denom <= 0.35) continue;
      const rowDist = (zOff * rows) / denom;
      if (rowDist < near || rowDist >= far) continue;
      const fx = posX + rayDirX * rowDist;
      const fy = posY + rayDirY * rowDist;
      const along = span.kind === 1 ? fy : fx;
      const across = span.kind === 1 ? fx : fy;
      const frac = across - Math.floor(across);
      const edge = frac < 0.14 || frac > 0.86;
      const rib = ((along * 3) | 0) % 3 === 0;
      const i = y * cols + x;
      chars[i] = edge ? CH.eq : rib ? CH.hash : CH.tilde;
      const pal = span.pal || C.CYAN;
      colors[i] = fogColor(
        edge ? (breath > 0.5 ? pal : DIM_OF[pal] || pal) : DIM_OF[pal] || pal,
        rowDist
      );
    }
  }

  if (far > near + 0.2 && far < wallDist - 0.03) {
    paintSpanFace(
      chars,
      colors,
      cols,
      rows,
      horizon,
      eye,
      far,
      night,
      x,
      span,
      faceU(hit.sideFar, posX, posY, rayDirX, rayDirY, far)
    );
  }
  if (hit.tNear > 0.45 && near < wallDist) {
    paintSpanFace(
      chars,
      colors,
      cols,
      rows,
      horizon,
      eye,
      near,
      night,
      x,
      span,
      faceU(hit.sideNear, posX, posY, rayDirX, rayDirY, near)
    );
  }
}

function drawMapSpans(chars, colors, cols, rows, horizon, eye, night, x, map, posX, posY, rayDirX, rayDirY, wallDist) {
  const list = map.spans;
  if (!list || !list.length) return;
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const hit = rayAabb2d(posX, posY, rayDirX, rayDirY, s.x0, s.y0, s.x1, s.y1);
    if (!hit || hit.tNear >= wallDist) continue;
    if (!best || hit.tNear < best.hit.tNear) best = { span: s, hit };
  }
  if (best) {
    drawSpanBox(chars, colors, cols, rows, horizon, eye, night, x, posX, posY, rayDirX, rayDirY, wallDist, best.span, best.hit);
  }
}

function setZoneFog(floor) {
  fogAlley = floor === FLOOR_ALLEY;
  fogPlaza = floor === FLOOR_PLAZA;
  if (fogAlley) {
    fogStart = FOG_ALLEY_START;
    fogEnd = FOG_ALLEY_END;
  } else {
    fogStart = FOG_START;
    fogEnd = FOG_END;
  }
}

function fogColor(color, dist) {
  const t = clamp01((dist - fogStart) / (fogEnd - fogStart || 1));
  if (t <= 0) return color;
  if (t > 0.82) {
    if (fogAlley) return C.MAGENTA_DIM;
    if (fogPlaza) return C.GOLD_DIM;
    return C.BLACK;
  }
  if (fogAlley && color === C.MAGENTA) {
    if (t > 0.58) return C.MAGENTA_DIM;
    return C.MAGENTA;
  }
  if (t > 0.48) {
    if (fogAlley) return C.MAGENTA;
    if (fogPlaza) return color === C.YELLOW ? C.AMBER : C.GOLD_DIM;
    return DIM_OF[DIM_OF[color]];
  }
  if (t > 0.16) {
    if (fogAlley && (color === C.GRAY || color === C.CYAN || color === C.CYAN_DIM || color === C.BLUE_DEEP)) {
      return C.MAGENTA;
    }
    if (fogPlaza && (color === C.GRAY || color === C.CYAN || color === C.CYAN_DIM)) {
      return C.AMBER;
    }
    return DIM_OF[color];
  }
  return color;
}

function fogChar(ch, dist) {
  const t = clamp01((dist - fogStart) / (fogEnd - fogStart || 1));
  if (t > 0.78) return fogAlley ? CH.dot : CH.space;
  if (t > 0.48) return CH.dot;
  if (t > 0.28 && (ch === CH.H || ch === CH.M || ch === CH.eight || ch === CH.O || ch === CH.X)) {
    return CH.colon;
  }
  return ch;
}

function openFloorAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return -1;
  const i = y * map.w + x;
  if (map.solid[i]) return -1;
  return map.floor[i];
}

function isPublicFloor(fl) {
  return fl === FLOOR_STREET || fl === FLOOR_SIDEWALK || fl === FLOOR_PLAZA || fl === FLOOR_PARK;
}

function pickWord(seed, x, y) {
  return BOARD_WORDS[hash2(seed, x * 3 + 1, y * 7 + 2) % BOARD_WORDS.length];
}

function packedSign(wallX, worldZ, x0, x1, z0, z1, word, ink, frame, fill) {
  if (wallX < x0 || wallX > x1 || worldZ < z0 || worldZ > z1) return 0;
  const u = (wallX - x0) / Math.max(1e-6, x1 - x0);
  const span = Math.max(1e-6, z1 - z0);
  if (u < 0.08 || u > 0.92) return (CH.pipe << 8) | frame;
  if (worldZ < z0 + span * 0.14 || worldZ > z1 - span * 0.14) return (CH.eq << 8) | frame;
  const n = word.length;
  const t = (u - 0.12) / 0.76;
  if (t >= 0 && t <= 1 && n) {
    const i = Math.min(n - 1, (t * n) | 0);
    const local = t * n - i;
    if (local > 0.1 && local < 0.9) {
      const lu = (local - 0.1) / 0.8;
      const lv = (z1 - span * 0.14 - worldZ) / (span * 0.72);
      if (glyphLit(word.charCodeAt(i), lu, lv)) return (CH.hash << 8) | ink;
    }
  }
  return fill;
}

function extraRoof(map, mapX, mapY, wallX, fromFloor) {
  if (!map.roof || mapX < 0 || mapY < 0 || mapX >= map.w || mapY >= map.h) return 0;
  const r = map.roof[mapY * map.w + mapX];
  if (r === ROOF_MAST && wallX > 0.42 && wallX < 0.58) return 1.7;
  if (r === ROOF_DISH && wallX > 0.22 && wallX < 0.78) return 0.32;
  if (r === ROOF_BOARD && isPublicFloor(fromFloor) && wallX > 0.1 && wallX < 0.9) return 0.9;
  return 0;
}

function sampleWindows(map, mapX, mapY, pat, pal, office, warm, wallX, worldZ, bodyH, breath, h0) {
  const floorH = 0.34;
  const story = Math.max(0, (worldZ / floorH) | 0);
  const fv = (worldZ - story * floorH) / floorH;
  const h = hash2(map.numericSeed, mapX * 17 + story, mapY * 11 + ((wallX * 8) | 0));
  let ch = CH.pipe;
  let color = DIM_OF[pal];

  if (pat === 5) {
    ch = h0 & 2 ? CH.H : CH.hash;
    color = DIM_OF[pal];
    if (fv > 0.4 && fv < 0.68 && (story & 1)) {
      ch = CH.dash;
      color = C.GRAY;
    }
  } else if (pat === 6) {
    const nWin = 2;
    const winCol = Math.min(nWin - 1, (wallX * nWin) | 0);
    const u = wallX * nWin - winCol;
    const inPane = u > 0.1 && u < 0.9 && fv > 0.14 && fv < 0.9 && story % 3 !== 1;
    ch = CH.pipe;
    if (inPane) {
      ch = h & 2 ? CH.colon : CH.dot;
      color = (h & 7) === 0 ? C.WHITE : office ? C.CYAN_DIM : C.GRAY;
    }
  } else if (pat === 8) {
    const nWin = 2;
    const winCol = Math.min(nWin - 1, (wallX * nWin) | 0);
    const u = wallX * nWin - winCol;
    const inPane = u > 0.28 && u < 0.72 && fv > 0.28 && fv < 0.78;
    ch = CH.pipe;
    if (inPane) {
      ch = fv > 0.42 && fv < 0.62 ? CH.O : CH.o;
      color = breath > 0.5 ? (warm ? C.YELLOW : C.CYAN) : pal;
    }
  } else if (pat === 9) {
    ch = fv > 0.32 && fv < 0.7 ? CH.dash : CH.pipe;
    color = fv > 0.32 && fv < 0.7 ? C.GRAY : DIM_OF[pal];
  } else if (pat === 10) {
    const nWin = 4;
    const winCol = Math.min(nWin - 1, (wallX * nWin) | 0);
    const u = wallX * nWin - winCol;
    const inPane = u > 0.14 && u < 0.88 && fv > 0.18 && fv < 0.86;
    if (fv < 0.12 || fv > 0.9) {
      ch = CH.dash;
      color = DIM_OF[pal];
    } else {
      ch = CH.pipe;
      if (inPane) {
        ch = h & 2 ? CH.colon : CH.dot;
        color = office ? C.CYAN_DIM : C.AMBER;
      }
    }
  } else {
    const nWin = pat === 1 ? 3 : pat === 2 ? 2 : pat === 3 ? 5 : 4;
    const winCol = Math.min(nWin - 1, (wallX * nWin) | 0);
    const u = wallX * nWin - winCol;
    const ribbon = pat === 4;
    const inPane = ribbon
      ? fv > 0.32 && fv < 0.7 && u > 0.08 && u < 0.92
      : u > 0.14 && u < 0.88 && fv > 0.18 && fv < 0.86;
    ch = CH.pipe;
    if (inPane) {
      const lit = (h & 15) < (office ? 3 : 2);
      const bright = (h & 31) === 0;
      if (lit || bright) {
        ch = bright ? CH.colon : CH.o;
        if (bright) color = C.WHITE;
        else if (pal === C.ORANGE) color = h & 4 ? C.ORANGE : C.RED;
        else if (warm) color = h & 4 ? C.YELLOW : C.AMBER;
        else color = h & 4 ? C.CYAN : C.CYAN_DIM;
      } else {
        ch = CH.dot;
        color = office ? C.BLUE_DEEP : C.GRAY;
      }
    } else if (pat === 2 && story & 1) {
      ch = CH.H;
    }
  }

  if (bodyH > 12 && worldZ > bodyH - 0.16 && pat !== 7) {
    ch = CH.dash;
    color = breath > 0.55 ? (office ? C.CYAN : C.MAGENTA) : DIM_OF[pal];
  }
  return { ch, color };
}

function sampleWall(map, mapX, mapY, side, wallX, v, dist, night, drawH, signU, fromFloor) {
  const i = mapY * map.w + mapX;
  const pal = map.pal[i] || C.BLUE;
  const pat = map.pattern[i];
  const bodyH = map.height[i] || 1;
  const colH = drawH || bodyH;
  const worldZ = (1 - v) * colH;
  const h0 = hash2(map.numericSeed, mapX * 13 + ((worldZ * 3.2) | 0), mapY * 7 + ((wallX * 8) | 0));
  const breath = night ? night.breath : 0.5;
  const buzz = night ? night.buzz : 0.5;
  const office = pal === C.CYAN || pal === C.BLUE || pal === C.BLUE_DEEP;
  const warm = pal === C.YELLOW || pal === C.AMBER || pal === C.ORANGE || pal === C.MAGENTA;
  const media = pat === 7;
  const faceId = hash2(map.numericSeed, mapX, mapY);
  const ink = breath > 0.5 ? (warm ? C.YELLOW : C.MAGENTA) : C.AMBER;
  const fillBoard = (CH.dot << 8) | C.BLUE_DEEP;
  const publicFace = isPublicFloor(fromFloor);
  const su = signU == null ? wallX : signU;

  let color = pal;
  let ch = CH.pipe;

  if (worldZ > bodyH + 0.02) {
    const r = map.roof ? map.roof[i] : 0;
    if (r === ROOF_MAST) {
      ch = CH.pipe;
      color = breath > 0.5 ? C.CYAN : C.CYAN_DIM;
    } else if (r === ROOF_BOARD && publicFace) {
      const packed =
        packedSign(
          su,
          worldZ,
          0.08,
          0.92,
          bodyH + 0.04,
          colH - 0.02,
          pickWord(map.numericSeed, mapX, mapY),
          ink,
          ink,
          fillBoard
        ) || fillBoard;
      ch = packed >> 8;
      color = packed & 255;
    } else if (r === ROOF_BOARD) {
      ch = CH.pipe;
      color = C.GRAY;
    } else {
      ch = worldZ > bodyH + 0.14 ? CH.o : CH.O;
      color = breath > 0.55 ? C.CYAN_DIM : C.GRAY;
    }
  } else if (worldZ < 0.38 && map.foliage[i]) {
    const g = hash2(0x51, mapX, (wallX * 10) | 0);
    ch = g & 1 ? CH.o : CH.dot;
    color = g & 2 ? C.LIME : C.GREEN_DIM;
  } else if (
    !media &&
    publicFace &&
    map.neon[i] &&
    (faceId & 3) === 0 &&
    wallX > 0.03 &&
    wallX < 0.11 &&
    worldZ >= 0.35 &&
    worldZ < Math.min(3.8, bodyH * 0.42)
  ) {
    ch = ((worldZ * 6) | 0) % 2 === 0 ? CH.dash : CH.pipe;
    color = breath > 0.5 ? (warm ? C.MAGENTA : C.CYAN) : warm ? C.MAGENTA_DIM : C.CYAN_DIM;
  } else if (media && worldZ <= bodyH) {
    const panelH = 3.4;
    const panel = Math.max(0, (worldZ / panelH) | 0);
    const pz = worldZ - panel * panelH;
    const scan = (worldZ * 5.4) | 0;
    const fill = ((scan & 1 ? CH.dash : CH.dot) << 8) | C.BLUE_DEEP;
    if (pz < 0.12 || pz > panelH - 0.12) {
      ch = CH.eq;
      color = C.GRAY;
    } else if (wallX < 0.07 || wallX > 0.93) {
      ch = CH.pipe;
      color = C.GRAY;
    } else if (publicFace) {
      const chatter = buzz > 0.9 && (faceId & 7) === 0;
      const packed =
        packedSign(
          su,
          pz,
          0.14,
          0.86,
          0.55,
          2.55,
          pickWord(map.numericSeed, mapX + panel * 13, mapY),
          chatter ? C.WHITE : breath > 0.55 ? C.MAGENTA : C.YELLOW,
          C.MAGENTA,
          fill
        ) || fill;
      ch = packed >> 8;
      color = packed & 255;
    } else {
      const win = sampleWindows(map, mapX, mapY, pat, pal, office, warm, wallX, worldZ, bodyH, breath, h0);
      ch = win.ch;
      color = win.color;
    }
  } else if (
    publicFace &&
    !media &&
    bodyH > 11 &&
    (faceId & 7) === 2 &&
    wallX > 0.12 &&
    wallX < 0.88
  ) {
    const z0 = bodyH * 0.5;
    const z1 = z0 + 1.2;
    if (worldZ >= z0 && worldZ <= z1) {
      const packed =
        packedSign(
          su,
          worldZ,
          0.12,
          0.88,
          z0,
          z1,
          pickWord(map.numericSeed, mapX + 9, mapY),
          ink,
          ink,
          fillBoard
        ) || fillBoard;
      ch = packed >> 8;
      color = packed & 255;
    } else {
      const win = sampleWindows(map, mapX, mapY, pat, pal, office, warm, wallX, worldZ, bodyH, breath, h0);
      ch = win.ch;
      color = win.color;
    }
  } else {
    const win = sampleWindows(map, mapX, mapY, pat, pal, office, warm, wallX, worldZ, bodyH, breath, h0);
    ch = win.ch;
    color = win.color;
  }

  if (wallX < 0.07 || wallX > 0.93) {
    const nmapX = side === 1 ? mapX + (wallX < 0.5 ? -1 : 1) : mapX;
    const nmapY = side === 0 ? mapY + (wallX < 0.5 ? -1 : 1) : mapY;
    let edge = true;
    if (nmapX >= 0 && nmapY >= 0 && nmapX < map.w && nmapY < map.h) {
      edge = map.bldg[nmapY * map.w + nmapX] !== map.bldg[i];
    }
    if (edge) {
      ch = CH.pipe;
      if (map.neon[i] && worldZ <= bodyH + 0.05) {
        if (breath > 0.55) color = office ? C.CYAN : C.MAGENTA;
        else if (breath > 0.28) color = office ? C.CYAN_DIM : C.MAGENTA_DIM;
        else color = C.MAGENTA_DIM;
      } else {
        color = warm ? C.YELLOW : C.CYAN;
      }
    }
  }

  if (side === 1) color = DIM_OF[color];

  if (fromFloor === FLOOR_PLAZA && worldZ < 0.55 && worldZ <= bodyH) {
    if (!(worldZ < 0.38 && map.foliage[i])) {
      ch = breath > 0.5 ? CH.eq : CH.plus;
      color = breath > 0.45 ? C.YELLOW : C.AMBER;
    }
  } else if (fromFloor === FLOOR_PARK && worldZ < 0.55 && worldZ <= bodyH) {
    if (!(worldZ < 0.38 && map.foliage[i])) {
      ch = h0 & 1 ? CH.o : CH.star;
      color = C.LIME;
    }
  }

  color = fogColor(color, dist);
  ch = fogChar(ch, dist);
  return (ch << 8) | color;
}

function parkAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const i = y * map.w + x;
  return !map.solid[i] && map.floor[i] === FLOOR_PARK;
}

function fountainFloor(map, fx, fy, night) {
  if (!map.plazaX || !map.plazaY) return 0;
  const dx = fx - map.plazaX;
  const dy = fy - map.plazaY;
  const r2 = dx * dx + dy * dy;
  if (r2 > 0.62) return 0;
  const r = Math.sqrt(r2);
  const breath = night ? night.breath : 0.5;
  if (r > 0.54) {
    return (CH.O << 8) | (breath > 0.5 ? C.CYAN : C.CYAN_DIM);
  }
  if (r < 0.1) {
    return (CH.hash << 8) | C.GRAY;
  }
  const ripple = ((fx * 11 + fy * 8) | 0) & 1;
  if (night && night.buzz > 0.82) return (CH.eq << 8) | C.WHITE;
  const ch = ripple ? CH.tilde : CH.colon;
  return (ch << 8) | (breath > 0.55 ? C.CYAN : C.CYAN_DIM);
}

function sampleFloor(map, fx, fy, dist, night) {
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) {
    return (CH.space << 8) | C.BLACK;
  }
  const pool = fountainFloor(map, fx, fy, night);
  if (pool) return pool;
  const i = iy * map.w + ix;
  const type = map.floor[i];
  const fracx = fx - ix;
  const fracy = fy - iy;
  const h = hash2(map.numericSeed ^ 0xabc, ix, iy);

  let ch = CH.dot;
  let color = C.GRAY;

  if (type === FLOOR_PARK) {
    const onPath = !map.foliage[i];
    const edge =
      !parkAt(map, ix - 1, iy) ||
      !parkAt(map, ix + 1, iy) ||
      !parkAt(map, ix, iy - 1) ||
      !parkAt(map, ix, iy + 1);
    const breath = night ? night.breath : 0.5;
    if (onPath) {
      const grid = fracx < 0.1 || fracy < 0.1;
      ch = grid ? CH.colon : CH.dot;
      color = grid ? C.LIME : C.GREEN_DIM;
      if ((h & 7) === 0 && dist < 16) {
        ch = CH.tilde;
        color = breath > 0.5 ? C.LIME : C.GREEN_DIM;
      }
    } else if (edge && (fracx < 0.12 || fracy < 0.12 || fracx > 0.88 || fracy > 0.88)) {
      ch = CH.colon;
      color = C.LIME;
    } else {
      const tuft = (h & 7) === 0;
      const leaf = (h & 3) === 1;
      ch = tuft ? CH.o : leaf ? CH.star : CH.dot;
      color = tuft ? C.LIME : (h & 1) ? C.GREEN_DIM : C.LIME;
      if (dist > 14) {
        ch = CH.dot;
        color = C.GREEN_DIM;
      }
    }
  } else if (type === FLOOR_ALLEY) {
    const ripple = Math.abs(Math.sin(fx * 7.2 + fy * 5.1));
    const grid = fracx < 0.16 || fracy < 0.16;
    const puddle = ripple > 0.28 || (h & 1) === 0;
    if (puddle) {
      if (ripple > 0.68) {
        ch = CH.eq;
        color = C.WHITE;
      } else {
        ch = ((fx * 5 + fy * 3) | 0) & 1 ? CH.tilde : CH.colon;
        color = C.MAGENTA;
      }
    } else if (grid) {
      ch = CH.colon;
      color = C.MAGENTA;
    } else {
      ch = CH.dot;
      color = C.MAGENTA_DIM;
    }
  } else if (type === FLOOR_PLAZA) {
    const breath = night ? night.breath : 0.5;
    const rim = 0.14 + breath * 0.32;
    const grid = fracx < rim || fracy < rim || fracx > 1 - rim || fracy > 1 - rim;
    if (grid) {
      ch = CH.eq;
      color = breath > 0.45 ? C.YELLOW : C.AMBER;
    } else {
      ch = breath > 0.62 ? CH.plus : CH.dot;
      color = breath > 0.5 ? C.AMBER : C.GOLD_DIM;
    }
    if ((h & 3) === 0 || (breath > 0.7 && (h & 1) === 0)) {
      ch = CH.plus;
      color = breath > 0.4 ? C.YELLOW : C.AMBER;
    }
  } else if (type === FLOOR_SIDEWALK) {
    const grid = fracx < 0.08 || fracy < 0.08 || fracx > 0.92 || fracy > 0.92;
    ch = grid ? CH.colon : CH.dot;
    color = grid ? C.CYAN_DIM : C.GRAY;
    if (map.foliage[i] && (h & 3) === 0) {
      ch = CH.o;
      color = C.LIME;
    }
    if ((h & 15) < 3 && dist < 12) {
      const breath = night ? night.breath : 0.5;
      const bounce = night && night.buzz > 0.7;
      ch = bounce ? CH.eq : CH.tilde;
      color = bounce || breath > 0.55 ? C.CYAN : C.CYAN_DIM;
    }
  } else {
    const grid = fracx < 0.06 || fracy < 0.06;
    const lane = Math.abs(fracx - 0.5) < 0.04 || Math.abs(fracy - 0.5) < 0.04;
    const puddle = (h % 11) < 3;
    const streak = Math.abs(fracx - 0.35) < 0.08 || Math.abs(fracy - 0.4) < 0.07;
    if (puddle && dist < 14) {
      const breath = night ? night.breath : 0.5;
      const bounce = night && night.buzz > 0.68;
      if (bounce && streak) {
        ch = CH.eq;
        color = C.WHITE;
      } else if (streak) {
        ch = CH.tilde;
        color = breath > 0.5 ? C.CYAN : C.MAGENTA;
      } else {
        ch = breath > 0.45 ? CH.colon : CH.dot;
        color = (h & 1) ? C.CYAN_DIM : C.MAGENTA_DIM;
        if (breath > 0.65) color = (h & 1) ? C.CYAN : C.MAGENTA;
      }
    } else if (grid) {
      ch = dist < 8 ? CH.pipe : CH.colon;
      color = dist < 5 ? C.CYAN : C.CYAN_DIM;
    } else if (lane && dist < 9) {
      ch = CH.dash;
      color = C.GOLD_DIM;
    } else {
      ch = dist < 9 ? CH.dot : CH.space;
      color = C.GRAY;
    }
  }

  color = fogColor(color, dist);
  ch = fogChar(ch, dist);
  return (ch << 8) | color;
}

export function renderFrame(map, cam, display, time, night) {
  const cols = display.cols;
  const rows = display.rows;
  const chars = display.chars;
  const colors = display.colors;
  chars.fill(32);
  colors.fill(0);
  const colZ = display.colZ;
  colZ.fill(1e9);
  setZoneFog(floorAt(map, cam.x, cam.y));

  const horizon = rows * 0.5 + cam.pitch * rows * 0.5;
  const posX = cam.x;
  const posY = cam.y;
  const dirX = Math.cos(cam.yaw);
  const dirY = Math.sin(cam.yaw);
  const planeX = -dirY * cam.plane;
  const planeY = dirX * cam.plane;
  const eye = cam.eye;
  const w = map.w;
  const h = map.h;
  const solid = map.solid;

  for (let x = 0; x < cols; x++) {
    const cameraX = (2 * x) / cols - 1;
    const rayDirX = dirX + planeX * cameraX;
    const rayDirY = dirY + planeY * cameraX;

    let mapX = posX | 0;
    let mapY = posY | 0;

    const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
    const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

    let stepX;
    let stepY;
    let sideDistX;
    let sideDistY;

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (posX - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - posX) * deltaDistX;
    }
    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (posY - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - posY) * deltaDistY;
    }

    let hit = 0;
    let side = 0;
    for (let s = 0; s < MAX_STEPS; s++) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      if (mapX < 0 || mapY < 0 || mapX >= w || mapY >= h) {
        hit = 1;
        break;
      }
      if (solid[mapY * w + mapX]) {
        hit = 1;
        break;
      }
    }

    if (hit) {
      let perpWallDist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
      if (perpWallDist < 0.08) perpWallDist = 0.08;
      colZ[x] = perpWallDist;

      const inBounds = mapX >= 0 && mapY >= 0 && mapX < w && mapY < h;
      const bHeight = inBounds ? map.height[mapY * w + mapX] || 8 : 16;

      let wallX;
      if (side === 0) wallX = posY + perpWallDist * rayDirY;
      else wallX = posX + perpWallDist * rayDirX;
      wallX -= Math.floor(wallX);
      const texFlip = (side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0);
      if (texFlip) wallX = 1 - wallX;
      const signU = texFlip ? wallX : 1 - wallX;
      const fromX = side === 0 ? mapX - stepX : mapX;
      const fromY = side === 1 ? mapY - stepY : mapY;
      const fromFloor = inBounds ? openFloorAt(map, fromX, fromY) : -1;

      const drawH = bHeight + extraRoof(map, mapX, mapY, wallX, fromFloor);
      const wallTop = horizon - ((drawH - eye) * rows) / perpWallDist;
      const wallBot = horizon + (eye * rows) / perpWallDist;

      const y0 = wallTop < 0 ? 0 : wallTop | 0;
      const y1 = wallBot >= rows ? rows - 1 : wallBot | 0;

      const span = wallBot - wallTop || 1;
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= rows) continue;
        const v = (y - wallTop) / span;
        const packed = inBounds
          ? sampleWall(map, mapX, mapY, side, wallX, v, perpWallDist, night, drawH, signU, fromFloor)
          : (CH.pipe << 8) | fogColor(C.BLUE_DEEP, perpWallDist);
        const i = y * cols + x;
        chars[i] = packed >> 8;
        colors[i] = packed & 255;
      }

      if (fogAlley || fogPlaza) {
        for (let y = 0; y < y0; y++) {
          const i = y * cols + x;
          if (chars[i] !== 32) continue;
          if ((hash2(x * 13 + y, (time * 4) | 0, mapX) & 15) < (fogPlaza ? 4 : 3)) {
            chars[i] = CH.dot;
            colors[i] = fogAlley ? C.MAGENTA : C.YELLOW;
          }
        }
      }

      const abut = spanAbutment(map.spans, mapX, mapY, side);
      if (abut && drawH > abut.z1) {
        paintSpanFace(chars, colors, cols, rows, horizon, eye, perpWallDist, night, x, abut, wallX, true);
      }

      for (let y = y1 + 1; y < rows; y++) {
        const denom = y - horizon;
        if (denom <= 0.35) continue;
        const rowDist = (eye * rows) / denom;
        if (rowDist > fogEnd + 2) continue;
        const fx = posX + rayDirX * rowDist;
        const fy = posY + rayDirY * rowDist;
        const packed = sampleFloor(map, fx, fy, rowDist, night);
        const i = y * cols + x;
        chars[i] = packed >> 8;
        colors[i] = packed & 255;
      }

      let yMin = y0;
      let march = 0;
      let extraHits = 0;
      while (yMin > 0 && march < 32 && extraHits < 8) {
        march++;
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        const oob = mapX < 0 || mapY < 0 || mapX >= w || mapY >= h;
        if (!oob && !solid[mapY * w + mapX]) continue;
        extraHits++;

        let perp2 = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
        if (perp2 < 0.08) perp2 = 0.08;
        if (perp2 > fogEnd) break;

        const in2 = !oob;
        const h2 = in2 ? map.height[mapY * w + mapX] || 8 : 18;
        let wallX2;
        if (side === 0) wallX2 = posY + perp2 * rayDirY;
        else wallX2 = posX + perp2 * rayDirX;
        wallX2 -= Math.floor(wallX2);
        const texFlip2 = (side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0);
        if (texFlip2) wallX2 = 1 - wallX2;
        const signU2 = texFlip2 ? wallX2 : 1 - wallX2;
        const fromX2 = side === 0 ? mapX - stepX : mapX;
        const fromY2 = side === 1 ? mapY - stepY : mapY;
        const fromFloor2 = in2 ? openFloorAt(map, fromX2, fromY2) : -1;
        const drawH2 = h2 + extraRoof(map, mapX, mapY, wallX2, fromFloor2);
        const top2 = horizon - ((drawH2 - eye) * rows) / perp2;
        const bot2 = horizon + (eye * rows) / perp2;
        const y0n = top2 < 0 ? 0 : top2 | 0;
        const yEnd = yMin - 1;
        if (y0n > yEnd) continue;

        const span2 = bot2 - top2 || 1;
        for (let y = y0n; y <= yEnd; y++) {
          if (y < 0 || y >= rows) continue;
          const v = (y - top2) / span2;
          const packed = in2
            ? sampleWall(map, mapX, mapY, side, wallX2, v, perp2, night, drawH2, signU2, fromFloor2)
            : (CH.pipe << 8) | fogColor(C.BLUE_DEEP, perp2);
          const i = y * cols + x;
          chars[i] = packed >> 8;
          colors[i] = packed & 255;
        }
        yMin = y0n;
      }

      for (let y = 0; y < yMin && y < rows; y++) {
        const flash = night && night.thunder > 0.2;
        if ((hash2(x, y, (cam.yaw * 20) | 0) & 255) < (flash ? 18 : fogAlley ? 16 : fogPlaza ? 14 : 3)) {
          const i = y * cols + x;
          chars[i] = CH.dot;
          colors[i] = flash ? C.WHITE : fogAlley ? C.MAGENTA : fogPlaza ? C.YELLOW : C.GRAY;
        }
      }
    } else {
      colZ[x] = 1e9;
      for (let y = 0; y < rows; y++) {
        if (y < horizon) {
          const flash = night && night.thunder > 0.2;
          if ((hash2(x, y, (cam.yaw * 20) | 0) & 255) < (flash ? 18 : fogAlley ? 16 : fogPlaza ? 14 : 3)) {
            const i = y * cols + x;
            chars[i] = CH.dot;
            colors[i] = flash ? C.WHITE : fogAlley ? C.MAGENTA : fogPlaza ? C.YELLOW : C.GRAY;
          }
        } else {
          const denom = y - horizon;
          if (denom <= 0.35) continue;
          const rowDist = (eye * rows) / denom;
          if (rowDist > fogEnd + 2) continue;
          const fx = posX + rayDirX * rowDist;
          const fy = posY + rayDirY * rowDist;
          const packed = sampleFloor(map, fx, fy, rowDist, night);
          const i = y * cols + x;
          chars[i] = packed >> 8;
          colors[i] = packed & 255;
        }
      }
    }

    drawMapSpans(chars, colors, cols, rows, horizon, eye, night, x, map, posX, posY, rayDirX, rayDirY, colZ[x]);
  }
}

export function drawRain(display, time, night, floor) {
  const cols = display.cols;
  const rows = display.rows;
  const chars = display.chars;
  const colors = display.colors;
  const breath = night ? night.breath : 0.5;
  const thunder = night ? night.thunder : 0;
  let drops = (cols * (0.24 + breath * 0.12 + thunder * 0.38)) | 0;
  if (floor === FLOOR_PARK) drops = (drops * 0.22) | 0;
  else if (floor === FLOOR_ALLEY) drops = (drops * 0.5) | 0;
  const yCap =
    floor === FLOOR_ALLEY || floor === FLOOR_PARK ? Math.max(1, (rows * 0.55) | 0) : rows;
  for (let k = 0; k < drops; k++) {
    const hx = hash2(k, 17, 91);
    const x = hx % cols;
    const speed = 11 + (hx & 7) + thunder * 6;
    const y = (((hx >>> 8) % yCap) + time * speed) % yCap | 0;
    if ((hx & 3) === 0 && thunder < 0.2) continue;
    const i = y * cols + x;
    chars[i] = (hx & 1) ? 47 : 124;
    colors[i] = thunder > 0.35 ? C.WHITE : (hx & 2) ? C.CYAN_DIM : C.GRAY;
  }
  if (thunder > 0.2) {
    const extra = (cols * 0.12) | 0;
    for (let k = 0; k < extra; k++) {
      const hx = hash2(k, 44, (time * 20) | 0);
      const x = hx % cols;
      const y = hx % Math.max(1, (rows * 0.22) | 0);
      const i = y * cols + x;
      chars[i] = 46;
      colors[i] = C.WHITE;
    }
  }
}

export function drawCrosshair(display) {
  const x = (display.cols / 2) | 0;
  const y = (display.rows / 2) | 0;
  const i = y * display.cols + x;
  display.chars[i] = 43;
  display.colors[i] = C.CYAN_DIM;
}

export function drawMinimap(map, cam, display, sprites) {
  const mw = 15;
  const mh = 15;
  const cols = display.cols;
  const chars = display.chars;
  const colors = display.colors;
  const ox = cols - mw - 2;
  const oy = 1;
  if (ox < 2) return;
  const pcx = cam.x | 0;
  const pcy = cam.y | 0;
  const half = (mw / 2) | 0;

  for (let sy = -1; sy <= mh; sy++) {
    for (let sx = -1; sx <= mw; sx++) {
      const dx = ox + sx;
      const dy = oy + sy;
      if (dx < 0 || dy < 0 || dx >= cols || dy >= display.rows) continue;
      const i = dy * cols + dx;
      if (sx === -1 || sy === -1 || sx === mw || sy === mh) {
        chars[i] = 43;
        colors[i] = C.CYAN_DIM;
        continue;
      }
      const wx = pcx + sx - half;
      const wy = pcy + sy - half;
      if (wx < 0 || wy < 0 || wx >= map.w || wy >= map.h) {
        chars[i] = 32;
        colors[i] = C.BLACK;
        continue;
      }
      const mi = wy * map.w + wx;
      if (map.solid[mi]) {
        const lx = map.landmarkX | 0;
        const ly = map.landmarkY | 0;
        if (map.landmarkX && wx === lx && wy === ly) {
          chars[i] = 42;
          colors[i] = C.CYAN;
        } else {
          chars[i] = 35;
          colors[i] = map.pal[mi] || C.BLUE;
        }
      } else if (map.floor[mi] === FLOOR_PARK) {
        chars[i] = map.foliage[mi] ? 111 : 46;
        colors[i] = map.foliage[mi] ? C.LIME : C.GRAY;
      } else if (map.floor[mi] === FLOOR_PLAZA) {
        chars[i] = 43;
        colors[i] = C.AMBER;
      } else if (map.floor[mi] === FLOOR_ALLEY) {
        chars[i] = 58;
        colors[i] = C.MAGENTA_DIM;
      } else if (map.floor[mi] === FLOOR_SIDEWALK) {
        chars[i] = 58;
        colors[i] = C.GRAY;
      } else if (map.bridge && map.bridge[mi]) {
        chars[i] = 61;
        colors[i] = C.CYAN_DIM;
      } else {
        chars[i] = 46;
        colors[i] = C.CYAN_DIM;
      }
    }
  }

  if (sprites) {
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      const sx = Math.round(s.x) - pcx + half;
      const sy = Math.round(s.y) - pcy + half;
      if (sx < 0 || sy < 0 || sx >= mw || sy >= mh) continue;
      const idx = (oy + sy) * cols + (ox + sx);
      if (s.kind === 4) continue;
      if (s.kind === 2) {
        chars[idx] = 61;
        colors[idx] = C.AMBER;
      } else if (s.kind === 1) {
        chars[idx] = 79;
        colors[idx] = C.RED;
      } else if (s.kind === 0) {
        chars[idx] = 37;
        colors[idx] = C.MAGENTA;
      } else if (s.kind === 5) {
        chars[idx] = 111;
        colors[idx] = C.LIME;
      } else if (s.kind === 6) {
        chars[idx] = 37;
        colors[idx] = C.ORANGE;
      } else if (s.kind === 7) {
        chars[idx] = 35;
        colors[idx] = C.GRAY;
      } else if (s.kind === 8) {
        chars[idx] = 79;
        colors[idx] = C.CYAN;
      } else {
        chars[idx] = 105;
        colors[idx] = C.WHITE;
      }
    }
  }

  const px = ox + half;
  const py = oy + half;
  if (px >= 0 && py >= 0 && px < cols && py < display.rows) {
    let a = cam.yaw % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    const oct = Math.round(a / (Math.PI / 2)) % 4;
    const arrow = [62, 118, 60, 94][oct];
    const i = py * cols + px;
    chars[i] = arrow;
    colors[i] = C.WHITE;
  }
}

