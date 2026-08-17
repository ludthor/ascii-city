import { isSolidAt } from "./city.js";
import { KIND_CAR, KIND_DUMPSTER, KIND_STATUE, KIND_TREE, KIND_VENDOR } from "./sprites.js";

const RADIUS = 0.18;
const CAR_RADIUS = 0.4;
const TREE_RADIUS = 0.22;
const DUMP_RADIUS = 0.25;
const VENDOR_RADIUS = 0.2;
const WALK = 3.5;
const SPRINT = 6.4;
const YAW_SENS = 0.0024;
const PITCH_SENS = 0.0021;
const PITCH_EXTRA = (20 * Math.PI) / 180;
const PITCH_MAX = 0.42 + PITCH_EXTRA;
const PITCH_MIN = -0.38 - PITCH_EXTRA;

export function createPlayer(map) {
  return {
    x: map.spawnX,
    y: map.spawnY,
    yaw: map.spawnYaw,
    pitch: 0.2,
    eye: 0.55,
    eyeBase: 0.55,
    bob: 0,
    moving: false,
    plane: Math.tan((70 * Math.PI) / 180 / 2),
  };
}

function blocked(map, x, y) {
  const r = RADIUS;
  return (
    isSolidAt(map, x - r, y - r) ||
    isSolidAt(map, x + r, y - r) ||
    isSolidAt(map, x - r, y + r) ||
    isSolidAt(map, x + r, y + r)
  );
}

function blockedByCars(sprites, x, y) {
  if (!sprites) return false;
  const r2 = CAR_RADIUS * CAR_RADIUS;
  const t2 = TREE_RADIUS * TREE_RADIUS;
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    const r =
      s.kind === KIND_CAR
        ? r2
        : s.kind === KIND_TREE || s.kind === KIND_STATUE
          ? t2
          : s.kind === KIND_DUMPSTER
            ? DUMP_RADIUS * DUMP_RADIUS
            : s.kind === KIND_VENDOR
              ? VENDOR_RADIUS * VENDOR_RADIUS
              : 0;
    if (!r) continue;
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy < r) return true;
  }
  return false;
}

export function isBlockedAt(map, sprites, x, y) {
  return blocked(map, x, y) || blockedByCars(sprites, x, y);
}

export function unstickPlayer(player, map, sprites) {
  if (!isBlockedAt(map, sprites, player.x, player.y)) return false;
  const ix0 = Math.floor(player.x);
  const iy0 = Math.floor(player.y);
  for (let r = 0; r <= 16; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ix0 + dx + 0.5;
        const y = iy0 + dy + 0.5;
        if (!isBlockedAt(map, sprites, x, y)) {
          player.x = x;
          player.y = y;
          return true;
        }
      }
    }
  }
  return false;
}

export function updatePlayer(player, input, map, dt, sprites) {
  const look = input.consumeLook();
  player.yaw += look.yaw * YAW_SENS;
  player.pitch -= look.pitch * PITCH_SENS;
  if (player.pitch > PITCH_MAX) player.pitch = PITCH_MAX;
  if (player.pitch < PITCH_MIN) player.pitch = PITCH_MIN;

  const s = input.state;
  const dirX = Math.cos(player.yaw);
  const dirY = Math.sin(player.yaw);
  const strafeX = -dirY;
  const strafeY = dirX;

  let mx = 0;
  let my = 0;
  if (s.forward) {
    mx += dirX;
    my += dirY;
  }
  if (s.back) {
    mx -= dirX;
    my -= dirY;
  }
  if (s.left) {
    mx -= strafeX;
    my -= strafeY;
  }
  if (s.right) {
    mx += strafeX;
    my += strafeY;
  }

  const len = Math.hypot(mx, my);
  player.moving = len > 0;
  if (player.moving) {
    player.bob += dt * (s.sprint ? 13 : 9);
    const speed = (s.sprint ? SPRINT : WALK) * dt;
    mx = (mx / len) * speed;
    my = (my / len) * speed;
    const nx = player.x + mx;
    const ny = player.y + my;
    const blockedAt = (x, y) => blocked(map, x, y) || blockedByCars(sprites, x, y);
    if (!blockedAt(nx, ny)) {
      player.x = nx;
      player.y = ny;
    } else {
      if (!blockedAt(nx, player.y)) player.x = nx;
      if (!blockedAt(player.x, ny)) player.y = ny;
    }
  }
  player.eye = player.eyeBase + Math.sin(player.bob) * (player.moving ? 0.032 : 0);
}
