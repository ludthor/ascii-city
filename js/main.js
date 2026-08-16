import { hashString } from "./rng.js";
import { Display } from "./display.js";
import { generateCity, floorAt } from "./city.js?v=span8";
import { createInput } from "./input.js?v=park3";
import { createPlayer, updatePlayer, unstickPlayer } from "./player.js?v=life6";
import { renderFrame, drawRain, drawCrosshair, drawMinimap } from "./raycast.js?v=span8";
import {
  generateSprites,
  updateSprites,
  drawSprites,
  lookAtSign,
  nearestMovingCarDist,
} from "./sprites.js?v=brake1";
import { createAmbience } from "./audio.js?v=life7";
import { nightAt } from "./night.js";

const canvas = document.getElementById("view");
const overlay = document.getElementById("overlay");
const hudSeed = document.getElementById("hud-seed");
const hudFps = document.getElementById("hud-fps");
const overlaySeed = document.getElementById("overlay-seed");
const hudHint = document.getElementById("hud-hint");
const hudLook = document.getElementById("hud-look");

const params = new URLSearchParams(location.search);
let seed = params.get("seed");
if (!seed) {
  seed = String((Math.random() * 1e9) | 0);
  history.replaceState(null, "", `?seed=${encodeURIComponent(seed)}`);
}

const numericSeed = hashString(seed);
const city = generateCity(seed, numericSeed);
const sprites = generateSprites(city);
const player = createPlayer(city);
const rawX = params.get("x");
const rawY = params.get("y");
const qx = rawX == null || rawX === "" ? NaN : Number(rawX);
const qy = rawY == null || rawY === "" ? NaN : Number(rawY);
if (Number.isFinite(qx) && Number.isFinite(qy)) {
  player.x = qx;
  player.y = qy;
}
const rawYaw = params.get("yaw");
const qyaw = rawYaw == null || rawYaw === "" ? NaN : Number(rawYaw);
if (Number.isFinite(qyaw)) player.yaw = qyaw;
unstickPlayer(player, city, sprites);
const display = new Display(canvas);
const input = createInput(canvas, overlay);
const ambience = createAmbience();

hudSeed.textContent = Number.isFinite(qx) && Number.isFinite(qy)
  ? `seed ${seed} @ ${qx.toFixed(1)},${qy.toFixed(1)}`
  : `seed ${seed}`;
overlaySeed.textContent = `seed ${seed}`;

if (params.get("preview") === "1") {
  overlay.classList.add("hidden");
}

overlay.addEventListener("click", () => ambience.start());
canvas.addEventListener("click", () => ambience.start());

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) ambience.start();
  ambience.setLocked(locked);
});

function fit() {
  display.resize(window.innerWidth, window.innerHeight);
}

fit();
window.addEventListener("resize", fit);

let last = performance.now();
let fpsEma = 60;
let fpsAcc = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsEma = fpsEma * 0.9 + (1 / Math.max(dt, 0.0001)) * 0.1;
  fpsAcc += dt;
  if (fpsAcc > 0.25) {
    hudFps.textContent = `${Math.round(fpsEma)} fps`;
    fpsAcc = 0;
  }

  if (input.state.wantMute) {
    input.state.wantMute = false;
    const muted = ambience.toggleMute();
    hudHint.textContent = muted
      ? "WASD move · SHIFT sprint · MOUSE look · M map · K unmute"
      : "WASD move · SHIFT sprint · MOUSE look · M map · K mute";
  }

  const t = now / 1000;
  const night = nightAt(t, numericSeed);

  let honk = false;
  if (input.state.locked || params.get("preview") === "1") {
    updatePlayer(player, input, city, dt, sprites);
    const events = updateSprites(sprites, city, dt, night, player, t);
    honk = !!(events && events.honk);
  } else {
    input.consumeLook();
  }

  const look = lookAtSign(sprites, player);
  if (hudLook.textContent !== look) hudLook.textContent = look;

  ambience.tick(
    night,
    {
      carDist: nearestMovingCarDist(sprites, player.x, player.y),
      honk,
      floor: floorAt(city, player.x, player.y),
      moving: player.moving,
      sprint: input.state.sprint,
      look,
    },
    dt
  );
  renderFrame(city, player, display, t, night);
  drawRain(display, t, night);
  drawSprites(sprites, player, display, t, night);
  drawCrosshair(display);
  if (input.state.minimap) drawMinimap(city, player, display, sprites);
  display.present();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
