// ?shot=title|drive|chase|mission — stage a real scene for screenshots.
// The autopilot plays by the real rules; nothing is faked, only driven faster.
import { CFG } from './config.js';
import { PHASE, newState, startGame, step } from './world.js';
import { autopilot } from './input.js';

export function applyShot(state, input, shot) {
  const seed = 7;
  if (shot === 'title') {
    // A live town behind the title overlay: the game runs, the player
    // stands by the truck stop, traffic rolls past.
    Object.assign(state, newState(seed));
    startGame(state, seed);
    state.titleMode = true;
    state.camera.x = 850;
    state.camera.y = 695;
    return;
  }
  if (shot === 'drive') {
    startGame(state, seed);
    // Ten seconds of hauling: the truck is mid-highway with traffic around.
    runAutopilot(state, input, 10, () => false);
    return;
  }
  if (shot === 'chase') {
    startGame(state, seed);
    // Play through the first two missions, then flee in the storm.
    runAutopilot(state, input, 240, () => state.mission >= 2);
    runAutopilot(state, input, 15, () => false);
    return;
  }
  if (shot === 'mission') {
    startGame(state, seed);
    // Stop the moment the second car is delivered: the toast is fresh and
    // the chop shop is right there.
    runAutopilot(state, input, 240, () => state.mission >= 2);
    return;
  }
}

// Drive the autopilot for up to maxSeconds of game time, several steps per
// call so a full mission chain finishes in well under a second of wall time.
function runAutopilot(state, input, maxSeconds, stopWhen) {
  const dt = 1 / 60;
  let guard = 0;
  const maxSteps = maxSeconds * 60;
  while (guard++ < maxSteps) {
    if (state.phase !== PHASE.PLAY) break;
    if (stopWhen && stopWhen(state)) break;
    autopilot(state, input);
    step(state, input, dt);
  }
}

// Slow title drift: the camera circles the plaza while traffic rolls.
export function driftTitle(state, dt) {
  state.time += dt;
  const a = state.time * 0.12;
  state.camera.x = 850 + Math.cos(a) * 260;
  state.camera.y = 695 + Math.sin(a) * 180;
}
