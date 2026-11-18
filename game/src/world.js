// Dustline state and rules: player, vehicles, pedestrians, police, wanted,
// missions, the dust storm, shooting and collisions. No DOM here — the
// browser shell (main.js) owns the canvas, HUD and input.
import { CFG } from './config.js';
import { mulberry32 } from './random.js';
import { buildCity, findRoute, nearestNode, onRoad } from './city.js';
import { sfxShot, sfxHit, sfxThud, sfxPickup, sfxCrash, sfxSiren, sfxJingle, sfxBusted, sfxReload } from './audio.js';

export const PHASE = { TITLE: 'title', PLAY: 'play', PAUSE: 'pause', BUSTED: 'busted', WASTED: 'wasted' };

const MISSION_NAMES = ['The Haul', 'The Switch', 'The Dust'];
const MISSION_REWARD = [300, 0, 1000]; // The Switch pays per delivery instead.

export function newState(seed = 7) {
  const rng = mulberry32(seed);
  return {
    seed, rng,
    phase: PHASE.TITLE,
    prevPhase: PHASE.TITLE,
    time: 0,
    city: buildCity(seed),
    money: 100,
    mission: 0,
    missionStep: 0,
    missionTimer: 0,
    wanted: 0,
    timeSinceCrime: 99,
    storm: { active: false, t: 0, next: CFG.STORM_CYCLE },
    player: {
      x: 350, y: 1000, angle: 0, health: CFG.PLAYER.hp, r: CFG.PLAYER.r,
      inVehicle: null, aimX: 0, aimY: 0, mag: CFG.PISTOL.mag, reloadT: 0,
    },
    vehicles: [],
    peds: [],
    police: [],
    bullets: [],
    particles: [],
    dust: [],
    crates: [],
    camera: { x: 350, y: 1000 },
    toast: '',
    toastT: 0,
    message: '',
    messageT: 0,
    ramImmuneT: 0,
    healCd: 0,
    saveT: 0,
    policeSpawnT: 0,
    officerRouteT: 0,
    stats: { pedsDown: 0, carsStolen: 0, shotsFired: 0 },
    truck: null,
    markedCars: [],
  };
}

function vehRadius(kind) {
  const spec = kind === 'truck' ? CFG.TRUCK : kind === 'police' ? CFG.POLICE : CFG.CAR;
  return Math.hypot(spec.w, spec.h) / 2 * 0.62;
}

function makeVehicle(state, kind, x, y, angle, driver) {
  const spec = kind === 'truck' ? CFG.TRUCK : kind === 'police' ? CFG.POLICE : CFG.CAR;
  return {
    id: state.vehicles.length + Math.floor(state.rng() * 100000),
    kind, x, y, angle, speed: 0, vx: 0, vy: 0,
    w: spec.w, h: spec.h, r: vehRadius(kind),
    maxSpeed: spec.maxSpeed, accel: spec.accel, brake: spec.brake, turn: spec.turn, mass: spec.mass,
    driver, route: [], routeIdx: 0, look: 0,
    hp: 100, wrecked: false, color: pickCarColor(state.rng, kind),
    missionMark: false, sirenT: 0, targetSpeed: CFG.TRAFFIC_SPEED,
  };
}

function pickCarColor(rng, kind) {
  if (kind === 'police') return '#e8e8e8';
  if (kind === 'truck') return '#b8543f';
  const colors = ['#c9a227', '#4a7ab8', '#7ab84a', '#b84a7a', '#8a6ab8', '#c96a3a', '#e8e0d0', '#3a6a5a'];
  return colors[Math.floor(rng() * colors.length)];
}

function makePed(state, x, y) {
  return {
    x, y, angle: state.rng() * Math.PI * 2, speed: 0, r: 10,
    state: 'walk', stateT: 0,
    lane: null, along: 0, dir: 1, side: state.rng() < 0.5 ? -1 : 1,
    color: ['#c96a3a', '#4a7ab8', '#7ab84a', '#b84a7a', '#e8e0d0', '#8a6ab8'][Math.floor(state.rng() * 6)],
    waitT: 0, fleeX: 0, fleeY: 0, downT: 0,
  };
}

// A pedestrian's lane: a road segment to walk along, on the sidewalk.
function newLane(state) {
  const rng = state.rng;
  const vertical = rng() < 0.5;
  if (vertical) {
    const x = CFG.AVENUES[Math.floor(rng() * CFG.AVENUES.length)];
    return { vertical: true, at: x, from: 60, to: CFG.WORLD.h - 60, side: rng() < 0.5 ? -1 : 1 };
  }
  const ys = [...CFG.STREETS, CFG.HIGHWAY_Y];
  const y = ys[Math.floor(rng() * ys.length)];
  return { vertical: false, at: y, from: 60, to: CFG.WORLD.w - 60, side: rng() < 0.5 ? -1 : 1 };
}

function lanePos(lane, along) {
  const off = (lane.vertical ? CFG.ROAD_W : CFG.HIGHWAY_W) / 2 + 14;
  if (lane.vertical) return { x: lane.at + lane.side * off, y: along };
  const w = lane.at === CFG.HIGHWAY_Y ? CFG.HIGHWAY_W : CFG.ROAD_W;
  return { x: along, y: lane.at + lane.side * (w / 2 + 14) };
}

export function startGame(state, seed = 7, fresh = true) {
  const keep = { money: state.money, mission: state.mission };
  const next = newState(seed);
  Object.assign(state, next);
  if (!fresh) { state.money = keep.money; state.mission = keep.mission; }
  state.phase = PHASE.PLAY;
  state.city = buildCity(seed);
  spawnWorld(state);
  state.message = 'DUSTLINE';
  state.messageT = 2;
}

function spawnWorld(state) {
  const city = state.city;
  const rng = state.rng;
  // Player starts on foot by the truck stop.
  state.player.x = 350;
  state.player.y = 1000;
  state.player.angle = 0;
  state.player.health = CFG.PLAYER.hp;
  state.player.inVehicle = null;
  state.player.mag = CFG.PISTOL.mag;
  state.player.reloadT = 0;
  // The mission truck, parked at the truck stop.
  const truck = makeVehicle(state, 'truck', 250, 960, 0, 'parked');
  state.vehicles.push(truck);
  state.truck = truck;
  // 12 traffic cars on the roads.
  for (let i = 0; i < 12; i++) {
    const node = city.nodes[Math.floor(rng() * city.nodes.length)];
    const car = makeVehicle(state, 'car', node.x + (rng() - 0.5) * 40, node.y + (rng() - 0.5) * 40, rng() * Math.PI * 2, 'traffic');
    car.route = randomRoute(state);
    state.vehicles.push(car);
  }
  // 6 parked cars along the streets (stealable).
  const parkedSpots = [[600, 340], [900, 1660], [1500, 340], [1900, 1660], [2400, 940], [120, 1660]];
  for (const [x, y] of parkedSpots) {
    const car = makeVehicle(state, 'car', x, y, rng() < 0.5 ? 0 : Math.PI / 2, 'parked');
    state.vehicles.push(car);
  }
  // 20 pedestrians on the sidewalks.
  for (let i = 0; i < 20; i++) {
    const ped = makePed(state, 0, 0);
    ped.lane = newLane(state);
    ped.along = ped.lane.from + rng() * (ped.lane.to - ped.lane.from);
    ped.dir = rng() < 0.5 ? -1 : 1;
    const pos = lanePos(ped.lane, ped.along);
    ped.x = pos.x;
    ped.y = pos.y;
    state.peds.push(ped);
  }
  // Ammo crates at their fixed spots.
  state.crates = city.ammoCrates.map((c) => ({ x: c.x, y: c.y, taken: false, respawnT: 0 }));
  // Mission 2's marked cars are spawned when the mission starts.
  if (state.mission >= 1) spawnMarkedCars(state);
}

function spawnMarkedCars(state) {
  const spots = [[1150, 1120], [1450, 1120]];
  state.markedCars = [];
  for (const [x, y] of spots) {
    const car = makeVehicle(state, 'car', x, y, 0, 'parked');
    car.missionMark = true;
    car.color = '#ffb347';
    state.vehicles.push(car);
    state.markedCars.push(car);
  }
}

function randomRoute(state) {
  const city = state.city;
  const rng = state.rng;
  const route = [];
  let cur = nearestNode(city, state.player.x, state.player.y);
  for (let i = 0; i < 3; i++) {
    const dest = city.nodes[Math.floor(rng() * city.nodes.length)];
    const leg = findRoute(city, city.nodes[cur].x, city.nodes[cur].y, dest.x, dest.y);
    for (const p of leg) route.push(p);
    cur = nearestNode(city, dest.x, dest.y);
  }
  return route;
}

// Pure-pursuit lookahead point on a polyline route.
export function lookaheadPoint(route, x, y, look) {
  if (!route.length) return null;
  // Closest point on the polyline to (x, y), and how far along it is.
  let bestD = Infinity;
  let bestSeg = 0;
  let bestT = 0;
  let bestPoint = route[0];
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
    if (d < bestD) { bestD = d; bestSeg = i; bestT = t; bestPoint = { x: px, y: py }; }
  }
  // Walk `look` pixels forward along the polyline from that point.
  let remaining = look;
  let seg = bestSeg;
  let t = bestT;
  while (seg < route.length - 1) {
    const a = route[seg];
    const b = route[seg + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const leftInSeg = segLen * (1 - t);
    if (remaining <= leftInSeg) {
      const nt = t + remaining / segLen;
      return { x: a.x + (b.x - a.x) * nt, y: a.y + (b.y - a.y) * nt, done: false };
    }
    remaining -= leftInSeg;
    seg++;
    t = 0;
  }
  return { x: route[route.length - 1].x, y: route[route.length - 1].y, done: true };
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function addWanted(state, n) {
  state.wanted = Math.min(5, state.wanted + n);
  state.timeSinceCrime = 0;
}

function showToast(state, text) {
  state.toast = text;
  state.toastT = 3.5;
}

function burst(state, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = state.rng() * Math.PI * 2;
    const sp = 40 + state.rng() * 140;
    state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + state.rng() * 0.4, color });
  }
}

// Circle vs AABB push-out. Returns the push normal, or null.
function collideCircleRect(x, y, r, rect) {
  const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - nx;
  const dy = y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  // Centre inside the rect: push out along the shallow axis.
  const left = x - rect.x;
  const right = rect.x + rect.w - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.h - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, depth: left + r };
  if (m === right) return { nx: 1, ny: 0, depth: right + r };
  if (m === top) return { nx: 0, ny: -1, depth: top + r };
  return { nx: 0, ny: 1, depth: bottom + r };
}

function collideCircleRock(x, y, r, rock) {
  const dx = x - rock.x;
  const dy = y - rock.y;
  const d = Math.hypot(dx, dy);
  const min = r + rock.r;
  if (d >= min || d < 0.0001) return null;
  return { nx: dx / d, ny: dy / d, depth: min - d };
}

// Resolve a circle against every solid in the city. Mutates pos, and for a
// velocity object removes the into-wall component so the body slides.
function resolveSolids(state, pos, r, vel) {
  const city = state.city;
  for (const b of city.buildings) {
    const hit = collideCircleRect(pos.x, pos.y, r, b);
    if (hit) pushOut(pos, hit, vel);
  }
  for (const o of city.obstacles) {
    const hit = collideCircleRect(pos.x, pos.y, r, o);
    if (hit) pushOut(pos, hit, vel);
  }
  for (const rock of city.rocks) {
    const hit = collideCircleRock(pos.x, pos.y, r, rock);
    if (hit) pushOut(pos, hit, vel);
  }
  pos.x = clamp(pos.x, r, CFG.WORLD.w - r);
  pos.y = clamp(pos.y, r, CFG.WORLD.h - r);
}

function pushOut(pos, hit, vel) {
  pos.x += hit.nx * hit.depth;
  pos.y += hit.ny * hit.depth;
  if (vel) {
    const vn = vel.x * hit.nx + vel.y * hit.ny;
    if (vn < 0) { vel.x -= vn * hit.nx; vel.y -= vn * hit.ny; }
  }
}

function driveVehicle(state, v, throttle, steer, dt) {
  if (v.wrecked) return;
  // Steering scales with speed, and flips in reverse.
  const speedRatio = clamp(v.speed / v.maxSpeed, -1, 1);
  v.angle += steer * v.turn * speedRatio * dt;
  if (throttle > 0) v.speed += v.accel * throttle * dt;
  else if (throttle < 0) {
    if (v.speed > 5) v.speed += v.brake * throttle * dt;
    else v.speed += v.accel * 0.6 * throttle * dt;
  } else {
    v.speed -= v.speed * 0.5 * dt;
  }
  v.speed = clamp(v.speed, -v.maxSpeed * 0.4, v.maxSpeed);
  if (Math.abs(v.speed) < 1 && throttle === 0) v.speed = 0;
  v.vx = Math.cos(v.angle) * v.speed;
  v.vy = Math.sin(v.angle) * v.speed;
  const before = { x: v.x, y: v.y };
  v.x += v.vx * dt;
  v.y += v.vy * dt;
  resolveSolids(state, v, v.r, v);
  // A hard hit costs speed (and a crash sound for the player's car).
  const moved = Math.hypot(v.x - before.x, v.y - before.y);
  const want = Math.hypot(v.vx, v.vy) * dt;
  if (want > 0.01 && moved < want * 0.4) {
    v.speed *= 0.55;
    v.vx = Math.cos(v.angle) * v.speed;
    v.vy = Math.sin(v.angle) * v.speed;
    if (v.driver === 'player' && Math.abs(v.speed) > 60) sfxCrash();
  }
}

// Vehicle-vs-vehicle circle push-apart.
function separateVehicles(state) {
  const vs = state.vehicles;
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      const a = vs[i];
      const b = vs[j];
      if (a.wrecked && b.wrecked) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d >= min || d < 0.001) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (min - d) / 2;
      const ma = a.mass;
      const mb = b.mass;
      a.x -= nx * push * (mb / (ma + mb)) * 2;
      a.y -= ny * push * (mb / (ma + mb)) * 2;
      b.x += nx * push * (ma / (ma + mb)) * 2;
      b.y += ny * push * (ma / (ma + mb)) * 2;
      // Police ram: a police car hitting the player's vehicle hurts.
      const playerVeh = state.player.inVehicle;
      if (playerVeh && state.ramImmuneT <= 0) {
        const hitPlayer = (a === playerVeh && b.kind === 'police') || (b === playerVeh && a.kind === 'police');
        if (hitPlayer) {
          state.player.health -= CFG.RAM_DAMAGE;
          state.ramImmuneT = CFG.RAM_IMMUNITY;
          burst(state, state.player.x, state.player.y, '#ff5544', 8);
          sfxCrash();
          if (state.player.health <= 0) wasted(state);
        }
      }
      a.speed *= 0.9;
      b.speed *= 0.9;
    }
  }
}

function busted(state) {
  if (state.phase !== PHASE.PLAY) return;
  state.money = Math.max(0, state.money - 200);
  state.wanted = 0;
  state.police = [];
  state.player.health = CFG.PLAYER.hp;
  exitVehicle(state);
  state.player.x = state.city.hospitalDoor.x;
  state.player.y = state.city.hospitalDoor.y;
  state.phase = PHASE.BUSTED;
  sfxBusted();
}

function wasted(state) {
  if (state.phase !== PHASE.PLAY) return;
  state.money = Math.max(0, state.money - 200);
  state.wanted = 0;
  state.police = [];
  state.player.health = CFG.PLAYER.hp;
  exitVehicle(state);
  state.player.x = state.city.hospitalDoor.x;
  state.player.y = state.city.hospitalDoor.y;
  state.phase = PHASE.WASTED;
  sfxBusted();
}

function exitVehicle(state) {
  const v = state.player.inVehicle;
  if (!v) return;
  v.driver = 'parked';
  v.speed = 0;
  state.player.inVehicle = null;
  state.player.x = v.x + Math.cos(v.angle + Math.PI / 2) * (v.h / 2 + 20);
  state.player.y = v.y + Math.sin(v.angle + Math.PI / 2) * (v.h / 2 + 20);
  state.player.x = clamp(state.player.x, 20, CFG.WORLD.w - 20);
  state.player.y = clamp(state.player.y, 20, CFG.WORLD.h - 20);
}

function enterVehicle(state, v) {
  const wasParked = v.driver === 'parked';
  const wasTraffic = v.driver === 'traffic';
  if (v.wrecked) return;
  if (v === state.truck && state.mission === 0) {
    // The job's truck: no crime.
  } else if (v.missionMark) {
    addWanted(state, 1);
    state.stats.carsStolen++;
  } else if (wasParked || wasTraffic) {
    addWanted(state, 1);
    state.stats.carsStolen++;
  }
  v.driver = 'player';
  state.player.inVehicle = v;
  state.player.x = v.x;
  state.player.y = v.y;
}

function nearestDrivable(state) {
  const p = state.player;
  let best = null;
  let bd = 80 * 80;
  for (const v of state.vehicles) {
    if (v.wrecked || v.driver === 'player' || v.kind === 'police' || v.driver === 'police') continue;
    const d = (v.x - p.x) * (v.x - p.x) + (v.y - p.y) * (v.y - p.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function fireBullet(state) {
  const p = state.player;
  if (p.reloadT > 0) return;
  if (p.mag <= 0) {
    p.reloadT = CFG.PISTOL.reload;
    sfxReload();
    return;
  }
  p.mag--;
  state.stats.shotsFired++;
  const a = Math.atan2(p.aimY - p.y, p.aimX - p.x);
  state.bullets.push({
    x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18,
    vx: Math.cos(a) * CFG.PISTOL.bulletSpeed, vy: Math.sin(a) * CFG.PISTOL.bulletSpeed,
    life: CFG.PISTOL.range / CFG.PISTOL.bulletSpeed, damage: CFG.PISTOL.damage,
  });
  burst(state, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, '#ffcc44', 3);
  sfxShot();
  // A shot fired near the police is a crime.
  if (state.police.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < 300)) addWanted(state, 1);
  if (p.mag === 0) { p.reloadT = CFG.PISTOL.reload; sfxReload(); }
}

function missionObjective(state) {
  if (state.mission === 0) {
    if (state.player.inVehicle === state.truck) return 'Drive the truck to the quarry';
    return 'Get in the truck at the truck stop';
  }
  if (state.mission === 1) {
    const left = state.markedCars.filter((c) => !c.delivered).length;
    if (state.player.inVehicle && state.player.inVehicle.missionMark) return 'Drive the marked car to Rusty\'s chop shop';
    return `Steal a marked car and take it to Rusty's (${2 - left}/2 delivered)`;
  }
  if (state.mission === 2) {
    if (state.wanted === 0) return 'Reach The Barn safehouse';
    return 'Lose the cops, then reach The Barn';
  }
  return 'Free roam — all missions complete';
}

function missionMarker(state) {
  if (state.mission === 0) {
    if (state.player.inVehicle === state.truck) return state.city.quarryMarker;
    return { x: state.truck.x, y: state.truck.y };
  }
  if (state.mission === 1) {
    if (state.player.inVehicle && state.player.inVehicle.missionMark) return state.city.rustyDoor;
    const left = state.markedCars.find((c) => !c.delivered);
    return left ? { x: left.x, y: left.y } : state.city.rustyDoor;
  }
  if (state.mission === 2) {
    if (state.wanted === 0) return state.city.barnDoor;
    return null;
  }
  return null;
}

function completeMission(state) {
  const reward = MISSION_REWARD[state.mission];
  state.money += reward;
  showToast(state, reward > 0 ? `${MISSION_NAMES[state.mission]} complete — +$${reward}` : `${MISSION_NAMES[state.mission]} complete`);
  sfxJingle();
  state.mission++;
  state.missionStep = 0;
  state.missionTimer = 0;
  if (state.mission === 1) spawnMarkedCars(state);
  if (state.mission === 2) {
    state.storm.active = true;
    state.storm.t = Infinity;
    addWanted(state, 5);
  }
  if (state.mission >= 3) {
    state.storm.active = false;
    state.storm.t = 0;
    state.storm.next = CFG.STORM_CYCLE;
  }
}

export function step(state, input, dt) {
  if (state.phase !== PHASE.PLAY) return;
  state.time += dt;
  const p = state.player;
  if (state.toastT > 0) state.toastT -= dt;
  if (state.messageT > 0) state.messageT -= dt;
  if (state.ramImmuneT > 0) state.ramImmuneT -= dt;
  if (state.healCd > 0) state.healCd -= dt;
  state.timeSinceCrime += dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) p.mag = CFG.PISTOL.mag;
  }

  // Dust storm cycle (mission 3 forces it on until the mission ends).
  if (state.mission !== 2) {
    if (state.storm.active) {
      state.storm.t -= dt;
      if (state.storm.t <= 0) { state.storm.active = false; state.storm.next = CFG.STORM_CYCLE; }
    } else {
      state.storm.next -= dt;
      if (state.storm.next <= 0) { state.storm.active = true; state.storm.t = CFG.STORM_LEN; }
    }
  }
  // Dust motes drift with the wind around the camera.
  if (state.storm.active) {
    for (let i = 0; i < 3; i++) {
      state.dust.push({
        x: state.camera.x + (state.rng() - 0.5) * CFG.W * 1.4,
        y: state.camera.y + (state.rng() - 0.5) * CFG.H * 1.4,
        vx: 90 + state.rng() * 60, vy: 12 + state.rng() * 20,
        life: 1.6 + state.rng(), r: 1 + state.rng() * 2.5,
      });
    }
  }
  for (const d of state.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; }
  state.dust = state.dust.filter((d) => d.life > 0);

  // --- Player ---
  if (p.inVehicle) {
    const v = p.inVehicle;
    const throttle = (input.up ? 1 : 0) + (input.down ? -1 : 0);
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    driveVehicle(state, v, throttle, steer, dt);
    p.x = v.x;
    p.y = v.y;
    p.angle = v.angle;
    if (input.action) {
      input.action = false;
      exitVehicle(state);
    }
  } else {
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    const vel = { x: mx * CFG.PLAYER.walk, y: my * CFG.PLAYER.walk };
    p.x += vel.x * dt;
    p.y += vel.y * dt;
    resolveSolids(state, p, p.r, vel);
    p.angle = Math.atan2(p.aimY - p.y, p.aimX - p.x);
    if (input.action) {
      input.action = false;
      // The autopilot names its target vehicle; a human just takes the
      // nearest one.
      const target = input.enterTarget;
      const v = target && !target.wrecked && target.driver !== 'player' && target.kind !== 'police' && target.driver !== 'police' &&
        Math.hypot(target.x - p.x, target.y - p.y) < 80 ? target : nearestDrivable(state);
      if (v) enterVehicle(state, v);
    }
    if (input.fire) {
      input.fire = false;
      fireBullet(state);
    }
  }

  // Hospital heal: standing at the door tops health up.
  if (state.healCd <= 0 && Math.hypot(p.x - state.city.hospitalDoor.x, p.y - state.city.hospitalDoor.y) < 60) {
    if (p.health < CFG.PLAYER.hp) {
      p.health = CFG.PLAYER.hp;
      state.healCd = 10;
      sfxPickup();
      showToast(state, 'Patched up at the hospital');
    }
  }

  // Ammo crates.
  for (const c of state.crates) {
    if (c.taken) {
      c.respawnT -= dt;
      if (c.respawnT <= 0) c.taken = false;
      continue;
    }
    if (Math.hypot(p.x - c.x, p.y - c.y) < 34) {
      c.taken = true;
      c.respawnT = 30;
      p.mag = CFG.PISTOL.mag;
      p.reloadT = 0;
      sfxPickup();
      showToast(state, 'Ammo restocked');
    }
  }

  // --- Traffic ---
  for (const v of state.vehicles) {
    if (v.driver !== 'traffic' || v.wrecked) continue;
    const look = lookaheadPoint(v.route, v.x, v.y, 120);
    if (!look) { v.route = randomRoute(state); continue; }
    if (look.done) { v.route = randomRoute(state); continue; }
    const desired = Math.atan2(look.y - v.y, look.x - v.x);
    const steer = clamp(angleDiff(v.angle, desired) * 1.6, -1, 1);
    let throttle = v.speed < v.targetSpeed ? 1 : 0.2;
    // Brake for a vehicle right ahead.
    for (const o of state.vehicles) {
      if (o === v || o.wrecked) continue;
      const dx = o.x - v.x;
      const dy = o.y - v.y;
      const ahead = dx * Math.cos(v.angle) + dy * Math.sin(v.angle);
      const side = Math.abs(-dx * Math.sin(v.angle) + dy * Math.cos(v.angle));
      if (ahead > 0 && ahead < 70 && side < 30) { throttle = -1; break; }
    }
    driveVehicle(state, v, throttle, steer, dt);
  }

  // --- Pedestrians ---
  for (const ped of state.peds) {
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) {
        // A fresh walker takes their place.
        const fresh = makePed(state, 0, 0);
        fresh.lane = newLane(state);
        fresh.along = fresh.lane.from + state.rng() * (fresh.lane.to - fresh.lane.from);
        fresh.dir = state.rng() < 0.5 ? -1 : 1;
        const pos = lanePos(fresh.lane, fresh.along);
        fresh.x = pos.x;
        fresh.y = pos.y;
        Object.assign(ped, fresh);
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.stateT -= dt;
      const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      ped.x += Math.cos(away) * 220 * dt;
      ped.y += Math.sin(away) * 220 * dt;
      ped.angle = away;
      if (ped.stateT <= 0) ped.state = 'walk';
      continue;
    }
    // Crosswalk behaviour: wait on the kerb while a fast vehicle is near
    // the crossing, hurry once committed.
    const pos = lanePos(ped.lane, ped.along);
    const crossing = crossingAhead(state, ped);
    if (crossing && ped.state !== 'wait') {
      // About to step into the crossing: check for fast traffic.
      if (fastVehicleNear(state, crossing.x, crossing.y, 130)) {
        ped.state = 'wait';
        ped.waitT = 0;
      }
    }
    if (ped.state === 'wait') {
      ped.waitT += dt;
      if (!crossing || !fastVehicleNear(state, crossing.x, crossing.y, 130) || ped.waitT > 3) {
        ped.state = 'walk';
        ped.speed = 60;
      } else {
        ped.speed = 0;
      }
    } else {
      const inCrossing = crossing && Math.abs(ped.along - crossing.along) < 60;
      ped.speed = inCrossing ? 110 : 60;
      ped.along += ped.dir * ped.speed * dt;
      if (ped.along > ped.lane.to || ped.along < ped.lane.from) {
        ped.lane = newLane(state);
        ped.along = ped.lane.from + state.rng() * (ped.lane.to - ped.lane.from);
        ped.dir = state.rng() < 0.5 ? -1 : 1;
      }
      const next = lanePos(ped.lane, ped.along);
      ped.x = next.x;
      ped.y = next.y;
      ped.angle = ped.dir > 0 ? (ped.lane.vertical ? Math.PI / 2 : 0) : (ped.lane.vertical ? -Math.PI / 2 : Math.PI);
    }
    // Run over by the player's vehicle.
    const pv = p.inVehicle;
    if (pv && !pv.wrecked && Math.abs(pv.speed) > 60) {
      if (Math.hypot(ped.x - pv.x, ped.y - pv.y) < pv.r + ped.r) {
        ped.state = 'down';
        ped.downT = 5;
        state.stats.pedsDown++;
        addWanted(state, 1);
        burst(state, ped.x, ped.y, '#ff5544', 10);
        sfxThud();
      }
    }
  }

  // --- Police ---
  state.policeSpawnT -= dt;
  if (state.policeSpawnT <= 0) {
    state.policeSpawnT = 1;
    maintainPolice(state);
  }
  state.officerRouteT -= dt;
  const chaseRange = state.storm.active ? 350 : 700;
  for (const u of state.police) {
    if (u.unit === 'car') {
      const dist = Math.hypot(state.player.x - u.x, state.player.y - u.y);
      if (dist > chaseRange) {
        // Lost sight: converge on a node near the player's area, at patrol
        // speed, so a parked player is found but a driving one can still
        // break away — they search the area, they don't beeline the player.
        u.searchT = (u.searchT || 0) - dt;
        if (!u.searchRoute || u.searchT <= 0) {
          const near = state.city.nodes.filter((n) => {
            const d = Math.hypot(n.x - state.player.x, n.y - state.player.y);
            return d > 400 && d < 700;
          });
          const dest = (near.length ? near : state.city.nodes)[Math.floor(state.rng() * (near.length ? near.length : state.city.nodes.length))];
          u.searchRoute = findRoute(state.city, u.x, u.y, dest.x, dest.y);
          u.searchT = 6;
        }
        const look = lookaheadPoint(u.searchRoute, u.x, u.y, 120);
        if (!look || look.done) { u.searchRoute = null; continue; }
        const desired = Math.atan2(look.y - u.y, look.x - u.x);
        driveVehicle(state, u, u.speed < 150 ? 1 : 0.2, clamp(angleDiff(u.angle, desired) * 1.6, -1, 1), dt);
      } else {
        const desired = Math.atan2(state.player.y - u.y, state.player.x - u.x);
        driveVehicle(state, u, 1, clamp(angleDiff(u.angle, desired) * 2.2, -1, 1), dt);
      }
      u.sirenT += dt;
      if (u.sirenT > 1.4) { u.sirenT = 0; sfxSiren(); }
    } else {
      // Officer on foot: walk the road graph to the player, always toward
      // the waypoint after the closest point on the route — a lookahead
      // from far off the route would call the route done and freeze them.
      if (state.officerRouteT <= 0 || !u.route.length) {
        u.route = findRoute(state.city, u.x, u.y, state.player.x, state.player.y);
      }
      const next = routeNextPoint(u.route, u.x, u.y);
      if (next) {
        const a = Math.atan2(next.y - u.y, next.x - u.x);
        u.x += Math.cos(a) * 150 * dt;
        u.y += Math.sin(a) * 150 * dt;
        u.angle = a;
        resolveSolids(state, u, u.r, null);
      }
      if (Math.hypot(state.player.x - u.x, state.player.y - u.y) < 24 && !state.player.inVehicle) {
        busted(state);
        return;
      }
    }
  }
  if (state.officerRouteT <= 0) state.officerRouteT = 1.5;

  // --- Wanted decay ---
  if (state.wanted > 0 && state.timeSinceCrime > CFG.WANTED_DECAY) {
    const nearest = state.police.reduce((m, u) => Math.min(m, Math.hypot(u.x - p.x, u.y - p.y)), Infinity);
    if (nearest > 300) {
      state.wanted--;
      state.timeSinceCrime = 0;
    }
  }

  // --- Bullets ---
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    let dead = false;
    // Buildings stop bullets.
    for (const bd of state.city.buildings) {
      if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) { dead = true; break; }
    }
    if (dead) { b.life = 0; burst(state, b.x, b.y, '#ffcc44', 3); continue; }
    // Peds.
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(b.x - ped.x, b.y - ped.y) < ped.r + 4) {
        ped.state = 'down';
        ped.downT = 5;
        state.stats.pedsDown++;
        addWanted(state, 1);
        burst(state, ped.x, ped.y, '#ff5544', 10);
        sfxHit();
        b.life = 0;
        dead = true;
        break;
      }
    }
    if (dead) continue;
    // Officers.
    for (const u of state.police) {
      if (u.unit !== 'officer') continue;
      if (Math.hypot(b.x - u.x, b.y - u.y) < u.r + 4) {
        u.hp -= CFG.PISTOL.damage;
        burst(state, u.x, u.y, '#ff5544', 6);
        sfxHit();
        b.life = 0;
        dead = true;
        if (u.hp <= 0) {
          u.down = true;
          addWanted(state, 1);
        }
        break;
      }
    }
    if (dead) continue;
    // Vehicles.
    for (const v of state.vehicles) {
      if (v.wrecked || v === p.inVehicle) continue;
      if (Math.hypot(b.x - v.x, b.y - v.y) < v.r) {
        v.hp -= CFG.PISTOL.damage;
        burst(state, b.x, b.y, '#ffcc44', 5);
        sfxHit();
        b.life = 0;
        if (v.hp <= 0) {
          v.wrecked = true;
          v.speed = 0;
          burst(state, v.x, v.y, '#666666', 16);
          sfxCrash();
        }
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
  state.police = state.police.filter((u) => !u.down);
  // Wrecked traffic cars get towed away after a while (keeps the roads clear).
  for (const v of state.vehicles) {
    if (v.wrecked && v.driver === 'traffic') {
      v.wreckT = (v.wreckT || 0) + dt;
      if (v.wreckT > 20) {
        v.wrecked = false;
        v.hp = 100;
        v.wreckT = 0;
        const node = state.city.nodes[Math.floor(state.rng() * state.city.nodes.length)];
        v.x = node.x;
        v.y = node.y;
        v.route = randomRoute(state);
      }
    }
  }

  // --- Missions ---
  if (state.mission === 0) {
    if (state.player.inVehicle === state.truck) {
      if (state.missionTimer === 0) { state.missionTimer = 120; showToast(state, 'Haul the load to the quarry — 2:00'); }
      state.missionTimer -= dt;
      if (Math.hypot(p.x - state.city.quarryMarker.x, p.y - state.city.quarryMarker.y) < 90) {
        completeMission(state);
      } else if (state.missionTimer <= 0) {
        state.missionTimer = 0;
        showToast(state, 'Too slow — the load spoiled. Try again');
        state.player.inVehicle = null;
        state.truck.driver = 'parked';
        state.truck.x = 250;
        state.truck.y = 960;
        state.truck.angle = 0;
        state.truck.speed = 0;
        p.x = 350;
        p.y = 1000;
      }
    }
  } else if (state.mission === 1) {
    const v = p.inVehicle;
    if (v && v.missionMark && Math.hypot(p.x - state.city.rustyDoor.x, p.y - state.city.rustyDoor.y) < 90) {
      v.delivered = true;
      v.missionMark = false;
      state.money += 250;
      showToast(state, `Car delivered — +$250 (${state.markedCars.filter((c) => c.delivered).length}/2)`);
      sfxJingle();
      exitVehicle(state);
      state.vehicles = state.vehicles.filter((x) => x !== v);
      if (state.markedCars.every((c) => c.delivered)) completeMission(state);
    }
  } else if (state.mission === 2) {
    if (state.wanted === 0 && Math.hypot(p.x - state.city.barnDoor.x, p.y - state.city.barnDoor.y) < 90) {
      completeMission(state);
    }
  }

  // --- Vehicles separation, particles, camera, save ---
  separateVehicles(state);
  for (const pt of state.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  state.camera.x = clamp(p.x, CFG.W / 2, CFG.WORLD.w - CFG.W / 2);
  state.camera.y = clamp(p.y, CFG.H / 2, CFG.WORLD.h - CFG.H / 2);
  state.saveT += dt;
  if (state.saveT > 10) {
    state.saveT = 0;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('dustline-save', JSON.stringify({ money: state.money, mission: state.mission, x: p.x, y: p.y }));
      }
    } catch { /* private mode */ }
  }
  if (p.health <= 0) wasted(state);
}

// The waypoint after the closest point on a route polyline: the right
// target for a walker following the route from anywhere nearby.
function routeNextPoint(route, x, y) {
  if (!route.length) return null;
  if (route.length === 1) return route[0];
  let bestD = Infinity;
  let bestSeg = 0;
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
    if (d < bestD) { bestD = d; bestSeg = i; }
  }
  return route[bestSeg + 1];
}

// Where a ped's lane crosses another road — the crossing point, if any.
function crossingAhead(state, ped) {
  const lane = ped.lane;
  const crossings = [];
  if (lane.vertical) {
    for (const y of [...CFG.STREETS, CFG.HIGHWAY_Y]) crossings.push({ along: y, x: lane.at, y });
  } else {
    for (const x of CFG.AVENUES) crossings.push({ along: x, x, y: lane.at });
  }
  let best = null;
  let bd = Infinity;
  for (const c of crossings) {
    const d = (c.along - ped.along) * ped.dir;
    if (d > 0 && d < 120 && d < bd) { bd = d; best = c; }
  }
  return best;
}

function fastVehicleNear(state, x, y, range) {
  for (const v of state.vehicles) {
    if (v.wrecked) continue;
    if (Math.abs(v.speed) > 150 && Math.hypot(v.x - x, v.y - y) < range) return true;
  }
  return false;
}

function maintainPolice(state) {
  const p = state.player;
  const wantCars = state.wanted === 0 ? 0 : Math.min(4, state.wanted);
  const wantOfficers = state.wanted >= 3 ? 2 : state.wanted >= 1 && !p.inVehicle ? 1 : 0;
  const cars = state.police.filter((u) => u.unit === 'car');
  const officers = state.police.filter((u) => u.unit === 'officer');
  // Spawn police cars when the player is driving.
  if (p.inVehicle && cars.length < wantCars) {
    const node = farNode(state);
    const car = makeVehicle(state, 'police', node.x, node.y, 0, 'police');
    car.route = randomRoute(state);
    car.unit = 'car';
    state.vehicles.push(car);
    state.police.push(car);
  }
  // Spawn officers when the player is on foot.
  if (!p.inVehicle && officers.length < wantOfficers) {
    const node = farNode(state);
    const off = {
      kind: 'officer', unit: 'officer', x: node.x + 40, y: node.y, angle: 0, speed: 150, r: 12,
      hp: 100, route: [], routeIdx: 0, down: false,
    };
    state.police.push(off);
  }
  // Officers lose a driving player fast: drop them when they fall behind.
  if (p.inVehicle) {
    state.police = state.police.filter((u) => u.unit !== 'officer' || Math.hypot(u.x - p.x, u.y - p.y) < 600);
  }
  // Despawn police that are far away when the heat is off.
  if (state.wanted === 0) {
    state.police = state.police.filter((u) => Math.hypot(u.x - p.x, u.y - p.y) < 500);
    for (const u of state.police) {
      if (u.unit === 'car') {
        const v = state.vehicles.find((x) => x === u);
        if (v) v.driver = 'traffic';
      }
    }
    if (state.police.length === 0) return;
  }
}

// A road node at least 400px from the player, for spawning police.
function farNode(state) {
  const p = state.player;
  const cands = state.city.nodes.filter((n) => Math.hypot(n.x - p.x, n.y - p.y) > 400);
  const list = cands.length ? cands : state.city.nodes;
  return list[Math.floor(state.rng() * list.length)];
}

export function currentObjective(state) { return missionObjective(state); }
export function currentMarker(state) { return missionMarker(state); }
