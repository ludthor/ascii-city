import { hash2 } from "./rng.js";

export function nightAt(time, seed) {
  const breath = 0.5 + 0.5 * Math.sin(time * 0.42);
  const buzz = 0.5 + 0.5 * Math.sin(time * 13.8);
  const period = 22 + (hash2(seed, 3, 9) % 19);
  const offset = 8 + (hash2(seed, 11, 5) % 17);
  const cycle = (time + offset) % period;
  const dur = 0.82;
  let thunder = 0;
  if (cycle < dur) {
    const t = cycle / dur;
    thunder = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.88);
    thunder *= thunder;
  }
  return { breath, buzz, thunder };
}
