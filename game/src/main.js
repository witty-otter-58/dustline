// Shell: game loop, HUD, minimap, overlays, save/load, screenshot staging.
import { CFG } from './config.js';
import { PHASE, newState, startGame, step, currentObjective, currentMarker } from './world.js';
import { render } from './render.js';
import { createInput, autopilot } from './input.js';
import { applyShot, driftTitle } from './shots.js';
import { ensureAudio, startPad, toggleMute, engineHum, windLoop } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const state = newState(7);
state.best = 0;

const $ = (id) => document.getElementById(id);
const overlays = {
  title: $('ov-title'), pause: $('ov-pause'),
  busted: $('ov-busted'), wasted: $('ov-wasted'),
};

function show(name) {
  for (const [k, el] of Object.entries(overlays)) el.classList.toggle('show', k === name);
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
}

function syncHud() {
  const p = state.player;
  $('hud-health').style.width = `${Math.max(0, p.health)}%`;
  $('hud-health').style.background = p.health > 50 ? '#3dff8e' : p.health > 25 ? '#ffb347' : '#ff5544';
  $('hud-money').textContent = `$${state.money.toLocaleString()}`;
  $('hud-wanted').textContent = stars(state.wanted);
  $('hud-wanted').style.color = state.wanted > 0 ? '#ff5544' : '#8b93b8';
  $('hud-ammo').textContent = p.inVehicle ? '—' : `${p.mag}/12`;
  $('hud-objective').textContent = currentObjective(state);
  const marker = currentMarker(state);
  $('hud-marker').textContent = marker ? `◈ ${Math.round(Math.hypot(marker.x - p.x, marker.y - p.y))}m` : '';
  const timer = state.mission === 0 && state.missionTimer > 0 ? ` ⏱ ${Math.ceil(state.missionTimer)}s` : '';
  $('hud-objective').textContent = currentObjective(state) + timer;
  if (state.toastT > 0) {
    $('toast').textContent = state.toast;
    $('toast').classList.add('show');
  } else {
    $('toast').classList.remove('show');
  }
  if (state.storm.active) $('hud-storm').textContent = '🌪 DUST STORM';
  else $('hud-storm').textContent = '';
}

function afterPhaseChange() {
  if (state.phase === PHASE.PLAY && !state.titleMode) show(null);
  else if (state.phase === PHASE.BUSTED) {
    $('busted-line').textContent = `The officer cuffed you. -$200. You wake up at the hospital.`;
    show('busted');
  } else if (state.phase === PHASE.WASTED) {
    $('wasted-line').textContent = `You wake up at the hospital, $200 lighter.`;
    show('wasted');
  }
}

function launch(fresh) {
  ensureAudio();
  startPad();
  const seed = 7;
  startGame(state, seed, fresh);
  state.titleMode = false;
  show(null);
}

function continueGame() {
  ensureAudio();
  startPad();
  let save = null;
  try { save = JSON.parse(localStorage.getItem('dustline-save') || 'null'); } catch { save = null; }
  startGame(state, 7, false);
  if (save) {
    state.money = save.money || 0;
    state.mission = save.mission || 0;
    state.player.x = save.x || 350;
    state.player.y = save.y || 1000;
    if (state.mission === 2) {
      // The Dust is still on: storm forced, five stars on your tail.
      state.storm.active = true;
      state.storm.t = Infinity;
      state.wanted = 5;
    }
  }
  state.titleMode = false;
  show(null);
}

$('btn-start').addEventListener('click', () => launch(true));
$('btn-continue').addEventListener('click', continueGame);
$('btn-resume').addEventListener('click', () => {
  state.phase = state.prevPhase;
  show(null);
});
$('btn-again-b').addEventListener('click', () => {
  state.phase = PHASE.PLAY;
  show(null);
});
$('btn-again-w').addEventListener('click', () => {
  state.phase = PHASE.PLAY;
  show(null);
});

input.onKey = (code) => {
  if (code === 'KeyM') {
    const m = toggleMute();
    document.querySelector('.sub').textContent = m ? 'muted — press M to unmute' : 'open-world crime · desert highway town';
  }
  if (code === 'KeyP') {
    if (state.phase === PHASE.PLAY && !state.titleMode) {
      state.prevPhase = PHASE.PLAY;
      state.phase = PHASE.PAUSE;
      show('pause');
    } else if (state.phase === PHASE.PAUSE) {
      state.phase = state.prevPhase;
      show(null);
    }
  }
  if (code === 'Enter') {
    if (state.phase === PHASE.TITLE || state.titleMode) launch(true);
    else if (state.phase === PHASE.BUSTED || state.phase === PHASE.WASTED) { state.phase = PHASE.PLAY; show(null); }
  }
};

// Screenshot staging: ?shot=title|drive|chase|mission runs the real game fast.
const shot = new URLSearchParams(location.search).get('shot');
let staged = false;
if (shot) {
  try {
    applyShot(state, input, shot);
    staged = true;
    if (shot === 'title') show('title');
    else show(null);
  } catch (err) {
    console.error('shot staging failed', err);
  }
} else {
  // Normal load: title screen over a live town.
  startGame(state, 7);
  state.titleMode = true;
  state.camera.x = 850;
  state.camera.y = 695;
  show('title');
}

let last = performance.now();
let prevPhase = state.phase;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.titleMode) {
    // The town lives behind the title overlay: traffic and peds move.
    const neutral = { up: false, down: false, left: false, right: false, action: false, fire: false, mouseX: 0, mouseY: 0, _ap: null };
    step(state, neutral, dt);
    driftTitle(state, dt);
  } else if (state.phase === PHASE.PLAY) {
    state.player.aimX = state.camera.x - CFG.W / 2 + input.mouseX;
    state.player.aimY = state.camera.y - CFG.H / 2 + input.mouseY;
    if (staged && shot !== 'title') {
      // Keep a staged scene alive: the autopilot keeps playing.
      autopilot(state, input);
    }
    step(state, input, dt);
  }
  if (state.phase !== prevPhase) { afterPhaseChange(); prevPhase = state.phase; }
  // Engine hum + storm wind follow the game state.
  if (state.phase === PHASE.PLAY && state.player.inVehicle) {
    engineHum(true, Math.abs(state.player.inVehicle.speed) / state.player.inVehicle.maxSpeed);
  } else {
    engineHum(false);
  }
  windLoop(state.storm.active && state.phase === PHASE.PLAY);
  render(ctx, state);
  syncHud();
  requestAnimationFrame(frame);
}
syncHud();
requestAnimationFrame(frame);
