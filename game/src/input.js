// Keyboard + mouse input, shared by the live game and the screenshot autopilot.
import { CFG } from './config.js';
import { lookaheadPoint, currentMarker } from './world.js';
import { findRoute } from './city.js';

export function createInput(canvas) {
  const input = {
    up: false, down: false, left: false, right: false,
    action: false, fire: false, enterTarget: null,
    mouseX: CFG.W / 2, mouseY: CFG.H / 2,
    _ap: null,
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { input.up = true; e.preventDefault(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { input.down = true; e.preventDefault(); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { input.left = true; e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { input.right = true; e.preventDefault(); }
    if (e.code === 'KeyE') { input.action = true; }
    if (input.onKey) input.onKey(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') input.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') input.down = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
    input.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.fire = true;
  });
  return input;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Closest point on a route polyline, with its distance.
function closestPointOnRoute(route, x, y) {
  if (!route.length) return null;
  let bestD = Infinity;
  let best = route[0];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bestD) { bestD = d; best = { x: px, y: py }; }
  }
  return { x: best.x, y: best.y, dist: Math.sqrt(bestD) };
}

// The autopilot plays by the real rules: it walks, enters vehicles, drives
// the road graph with pure pursuit, flees the police and delivers missions.
// It never shoots and never teleports.
export function autopilot(state, input) {
  const p = state.player;
  const ap = input._ap || (input._ap = {
    route: null, routeKey: '', reverseT: 0, stuckT: 0,
    lastX: 0, lastY: 0, sideT: 0, sideSign: 1, fleeKey: '', fleeT: 0,
  });
  // Aim where we are heading.
  p.aimX = p.x + Math.cos(p.angle) * 100;
  p.aimY = p.y + Math.sin(p.angle) * 100;

  // --- Pick a goal (and, when entering, the exact vehicle to enter) ---
  let goal = null;
  let goalKind = 'walk';
  if (state.mission === 0) {
    if (p.inVehicle === state.truck) { goal = state.city.quarryMarker; goalKind = 'drive'; }
    else if (p.inVehicle) { input.action = true; return; } // wrong car: get out
    else { ap.goalVeh = state.truck; goal = { x: state.truck.x, y: state.truck.y }; goalKind = 'enter'; }
  } else if (state.mission === 1) {
    if (p.inVehicle && p.inVehicle.missionMark) { goal = state.city.rustyDoor; goalKind = 'drive'; }
    else if (p.inVehicle) { input.action = true; return; }
    else {
      const left = state.markedCars.find((c) => !c.delivered);
      if (!left) return;
      ap.goalVeh = left;
      goal = { x: left.x, y: left.y };
      goalKind = 'enter';
    }
  } else if (state.mission === 2) {
    if (state.wanted > 0) {
      // Flee: keep driving to a node far from the nearest police. Repick
      // the moment one is reached — stopping lets the chase close in.
      ap.fleeT -= 1 / 60;
      const arrived = ap.fleeKey && Math.hypot(ap.fleeX - p.x, ap.fleeY - p.y) < 90;
      if (!ap.fleeKey || ap.fleeT <= 0 || arrived) {
        let best = null;
        let bestScore = -Infinity;
        for (const n of state.city.nodes) {
          const nearPolice = state.police.reduce((m, u) => Math.min(m, Math.hypot(u.x - n.x, u.y - n.y)), Infinity);
          const farPlayer = Math.hypot(n.x - p.x, n.y - p.y);
          const score = nearPolice + farPlayer * 0.5;
          if (score > bestScore) { bestScore = score; best = n; }
        }
        ap.fleeKey = best ? `${best.x},${best.y}` : '0,1000';
        ap.fleeX = best ? best.x : 0;
        ap.fleeY = best ? best.y : 1000;
        ap.fleeT = 8;
        ap.route = null;
      }
      const [fx, fy] = ap.fleeKey.split(',').map(Number);
      goal = { x: fx, y: fy };
      goalKind = p.inVehicle ? 'drive' : 'steal';
    } else if (p.inVehicle) { goal = state.city.barnDoor; goalKind = 'drive'; }
    else { goal = null; goalKind = 'steal'; }
  } else {
    // Free roam: park at the plaza.
    if (p.inVehicle) { goal = { x: 850, y: 695 }; goalKind = 'drive'; }
    else return;
  }

  if (goalKind === 'steal') {
    // On foot with heat (or no car): take the nearest drivable vehicle
    // (never a police car — those are locked). Parked cars score half
    // distance: they stay put, a moving one can drive away mid-chase.
    let best = null;
    let bestScore = Infinity;
    for (const v of state.vehicles) {
      if (v.wrecked || v.driver === 'player' || v.kind === 'police' || v.driver === 'police') continue;
      const d = Math.hypot(v.x - p.x, v.y - p.y) * (v.driver === 'parked' ? 0.5 : 1);
      if (d < bestScore) { bestScore = d; best = v; }
    }
    if (!best) return;
    ap.goalVeh = best;
    goal = { x: best.x, y: best.y };
    goalKind = 'enter';
  }

  // Follow the goal vehicle live: traffic cars move, parked ones don't.
  if (goalKind === 'enter' && ap.goalVeh) {
    goal = { x: ap.goalVeh.x, y: ap.goalVeh.y };
  }
  const dist = Math.hypot(goal.x - p.x, goal.y - p.y);

  // --- On foot: walk toward the goal (with a sidestep when stuck) ---
  if (!p.inVehicle) {
    // Enter only the goal vehicle: pressing E near any other car would
    // put the player in the wrong one and strand the mission.
    if (goalKind === 'enter' && ap.goalVeh && dist < 60) {
      input.enterTarget = ap.goalVeh;
      input.action = true;
      return;
    }
    input.enterTarget = null;
    // Stuck detection: barely moved for 1.5s of walking.
    ap.stuckT += 1 / 60;
    if (ap.stuckT > 1.5) {
      if (Math.hypot(p.x - ap.lastX, p.y - ap.lastY) < 6) {
        ap.sideT = 1;
        ap.sideSign *= -1;
      }
      ap.stuckT = 0;
      ap.lastX = p.x;
      ap.lastY = p.y;
    }
    let tx = goal.x;
    let ty = goal.y;
    if (ap.sideT > 0) {
      ap.sideT -= 1 / 60;
      const a = Math.atan2(goal.y - p.y, goal.x - p.x) + (Math.PI / 2) * ap.sideSign;
      tx = p.x + Math.cos(a) * 120;
      ty = p.y + Math.sin(a) * 120;
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    input.left = dx < -8;
    input.right = dx > 8;
    input.up = dy < -8;
    input.down = dy > 8;
    input.fire = false;
    return;
  }

  // --- Driving: pure pursuit along the road graph ---
  const key = `${goal.x},${goal.y}`;
  if (key !== ap.routeKey || !ap.route) {
    ap.routeKey = key;
    ap.route = findRoute(state.city, p.x, p.y, goal.x, goal.y);
  }
  const v = p.inVehicle;
  // Off the road (rammed off it, or a corner cut wide): steer back to the
  // nearest point on the route first, or the lookahead chases a point the
  // car can never reach through a building.
  const near = closestPointOnRoute(ap.route, v.x, v.y);
  let look;
  if (near && near.dist > 150) {
    look = { x: near.x, y: near.y, done: false };
  } else {
    look = lookaheadPoint(ap.route, v.x, v.y, 120);
  }
  if (!look || look.done) { ap.route = null; input.up = false; return; }
  const desired = Math.atan2(look.y - v.y, look.x - v.x);
  const diff = angleDiff(v.angle, desired);
  const steer = clamp(diff * 2, -1, 1);
  input.left = steer < -0.08;
  input.right = steer > 0.08;
  if (ap.reverseT > 0) {
    ap.reverseT -= 1 / 60;
    input.up = false;
    input.down = true;
    input.left = steer > 0.08;
    input.right = steer < -0.08;
    return;
  }
  // Stuck against a wall: reverse out.
  ap.stuckT += 1 / 60;
  if (ap.stuckT > 2) {
    if (Math.abs(v.speed) < 8) ap.reverseT = 1;
    ap.stuckT = 0;
  }
  if (Math.abs(diff) > 1.1 && Math.abs(v.speed) > 120) {
    input.up = false;
    input.down = true; // brake for the sharp turn
  } else {
    input.up = true;
    input.down = false;
  }
  input.fire = false;
}
