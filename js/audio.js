import { FLOOR_PARK } from "./city.js";

const CHIME_LABELS = { BAR: 1, OPEN: 1, RAMEN: 1, CAFE: 1 };

export function createAmbience() {
  let ctx = null;
  let master = null;
  let rainGain = null;
  let droneGain = null;
  let neonGain = null;
  let thunderGain = null;
  let whooshGain = null;
  const droneFilts = [];
  let started = false;
  let muted = false;
  let stepAcc = 0;
  let lastLook = "";
  let chimeCd = 0;

  function noiseBuffer(audio, seconds) {
    const n = (audio.sampleRate * seconds) | 0;
    const buf = audio.createBuffer(1, n, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function start() {
    if (started) return;
    started = true;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    ctx = new Audio();

    master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);

    droneGain = ctx.createGain();
    droneGain.gain.value = 0.045;
    droneGain.connect(master);

    const makeDrone = (freq, type, detune) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 140;
      filt.Q.value = 0.7;
      osc.connect(filt);
      filt.connect(droneGain);
      osc.start();
      droneFilts.push(filt);
    };
    makeDrone(46, "sawtooth", -6);
    makeDrone(69, "triangle", 9);

    const neon = ctx.createOscillator();
    neon.type = "sine";
    neon.frequency.value = 740;
    neonGain = ctx.createGain();
    neonGain.gain.value = 0.004;
    neon.connect(neonGain);
    neonGain.connect(master);
    neon.start();

    rainGain = ctx.createGain();
    rainGain.gain.value = 0.01;
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = "highpass";
    rainHp.frequency.value = 480;
    rainHp.Q.value = 0.5;
    const rainLp = ctx.createBiquadFilter();
    rainLp.type = "lowpass";
    rainLp.frequency.value = 3800;
    rainLp.Q.value = 0.55;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 2);
    src.loop = true;
    src.connect(rainHp);
    rainHp.connect(rainLp);
    rainLp.connect(rainGain);
    rainGain.connect(master);
    src.start();

    thunderGain = ctx.createGain();
    thunderGain.gain.value = 0;
    const rumbleFilt = ctx.createBiquadFilter();
    rumbleFilt.type = "lowpass";
    rumbleFilt.frequency.value = 110;
    rumbleFilt.Q.value = 0.9;
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx, 1.5);
    rumble.loop = true;
    rumble.connect(rumbleFilt);
    rumbleFilt.connect(thunderGain);
    thunderGain.connect(master);
    rumble.start();

    whooshGain = ctx.createGain();
    whooshGain.gain.value = 0;
    const whooshFilt = ctx.createBiquadFilter();
    whooshFilt.type = "bandpass";
    whooshFilt.frequency.value = 400;
    whooshFilt.Q.value = 0.85;
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = noiseBuffer(ctx, 1.2);
    whoosh.loop = true;
    whoosh.connect(whooshFilt);
    whooshFilt.connect(whooshGain);
    whooshGain.connect(master);
    whoosh.start();

    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 1.2);
  }

  function honk() {
    if (!ctx || muted || !master) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    g.connect(master);
    const blip = (freq) => {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = freq;
      o.connect(g);
      o.start(now);
      o.stop(now + 0.2);
    };
    blip(380);
    blip(420);
  }

  function footstep(park) {
    if (!ctx || muted || !master) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(park ? 0.028 : 0.045, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (park ? 0.07 : 0.05));
    g.connect(master);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = park ? 140 : 220;
    o.connect(g);
    o.start(now);
    o.stop(now + 0.08);
  }

  function chime() {
    if (!ctx || muted || !master) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.055, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    g.connect(master);
    const ding = (freq, at) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      o.start(now + at);
      o.stop(now + at + 0.22);
    };
    ding(880, 0);
    ding(1174, 0.07);
  }

  return {
    start,
    tick(night, street, dt) {
      if (!ctx || !droneGain) return;
      const breath = night.breath;
      const buzz = night.buzz;
      const thunder = night.thunder;
      const park = street && street.floor === FLOOR_PARK;
      const quiet = park ? 0.62 : 1;
      droneGain.gain.value = (0.038 + breath * 0.032) * quiet;
      if (neonGain) neonGain.gain.value = (0.0022 + buzz * 0.007 + breath * 0.003) * (park ? 0.7 : 1);
      if (rainGain) rainGain.gain.value = (0.008 + breath * 0.004 + thunder * 0.01) * (park ? 0.5 : 1);
      for (let i = 0; i < droneFilts.length; i++) {
        droneFilts[i].frequency.value = 108 + breath * 95;
      }
      if (thunderGain) thunderGain.gain.value = thunder * 0.16;
      if (whooshGain) {
        const dist = street && Number.isFinite(street.carDist) ? street.carDist : 99;
        const proximity = Math.max(0, 1 - dist / 6);
        whooshGain.gain.value = proximity * proximity * 0.055;
      }
      if (street && street.honk) honk();

      const stepDt = Number.isFinite(dt) ? dt : 0.016;
      if (street && street.moving) {
        stepAcc += stepDt;
        const period = street.sprint ? 0.28 : 0.42;
        if (stepAcc >= period) {
          stepAcc = 0;
          footstep(!!park);
        }
      } else {
        stepAcc = 0;
      }

      if (chimeCd > 0) chimeCd -= stepDt;
      const look = street && street.look ? street.look : "";
      if (look && look !== lastLook && CHIME_LABELS[look] && chimeCd <= 0) {
        chime();
        chimeCd = 2.5;
      }
      lastLook = look;
    },
    setLocked(locked) {
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.linearRampToValueAtTime(locked && !muted ? 1 : 0.15, now + 0.2);
      if (locked && ctx.state === "suspended") ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 1;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
