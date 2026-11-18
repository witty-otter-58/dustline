// Synthesized sound effects with WebAudio — no audio files needed.
// Safe to import in Node: every function no-ops when there is no window.
const hasWindow = typeof window !== 'undefined';
let ctx = null;
let muted = false;
let windNodes = null;

export function ensureAudio() {
  if (!hasWindow) return;
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() { muted = !muted; return muted; }
export function isMuted() { return muted; }

function tone(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, low) {
  if (!ctx || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = low || 1200;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

export function sfxShot() { noiseBurst(0.12, 0.22, 2400); tone(180, 0.08, 'square', 0.06, 60); }
export function sfxHit() { tone(200, 0.08, 'sawtooth', 0.07, 90); }
export function sfxThud() { tone(90, 0.18, 'sine', 0.12, 45); }
export function sfxPickup() { tone(660, 0.1, 'sine', 0.08, 990); }
export function sfxCrash() { noiseBurst(0.25, 0.2, 700); }
export function sfxSiren() { tone(750, 0.5, 'sine', 0.045, 1050); }
export function sfxJingle() {
  tone(523, 0.14, 'sine', 0.09);
  setTimeout(() => tone(659, 0.14, 'sine', 0.09), 130);
  setTimeout(() => tone(784, 0.28, 'sine', 0.09), 260);
}
export function sfxBusted() { tone(440, 0.3, 'sawtooth', 0.09, 110); }
export function sfxReload() { tone(300, 0.06, 'square', 0.04, 500); }

// Looping engine hum: an oscillator whose pitch follows speed.
let engine = null;
export function engineHum(on, speedRatio) {
  if (!ctx) return;
  if (!on) { if (engine) { try { engine.osc.stop(); } catch { /* already stopped */ } engine = null; } return; }
  if (!engine) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    g.gain.value = 0.02;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    osc.connect(f).connect(g).connect(ctx.destination);
    osc.start();
    engine = { osc, gain: g };
  }
  engine.osc.frequency.value = 50 + 90 * Math.max(0, Math.min(1, speedRatio || 0));
  engine.gain.gain.value = muted ? 0 : 0.02;
}

// Wind noise for the dust storm: filtered noise loop, fades in and out.
export function windLoop(on) {
  if (!ctx) return;
  if (!on) {
    if (windNodes) { try { windNodes.src.stop(); } catch { /* already stopped */ } windNodes = null; }
    return;
  }
  if (windNodes) return;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 420;
  f.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.value = muted ? 0 : 0.05;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
  windNodes = { src };
}

// A quiet ambient pad: two detuned sines through a low gain, started once.
let padOn = false;
export function startPad() {
  if (!ctx || padOn) return;
  padOn = true;
  const g = ctx.createGain();
  g.gain.value = 0.012;
  g.connect(ctx.destination);
  for (const f of [82.4, 82.9, 164.8]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g);
    o.start();
  }
}
