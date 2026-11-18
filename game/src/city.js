// Dustline: a sun-baked desert highway town. Roads, blocks, seeded adobe
// buildings, landmarks and the road graph cars drive on. Pure data built once
// from the seed — no browser needed.
import { CFG } from './config.js';
import { mulberry32 } from './random.js';

const PALETTE = [
  '#c98f5f', '#b87a4e', '#d9a86c', '#a8b8a0', '#8fa3a0',
  '#b8543f', '#c9b18a', '#9c6b4a', '#d8c090', '#7a8a6a',
  '#e0b878', '#a89078',
];

export function buildCity(seed = 7) {
  const rng = mulberry32(seed);
  const buildings = [];
  const cacti = [];
  const rocks = [];
  const obstacles = [];

  // Road rectangles, for drawing and for the minimap.
  const roads = [];
  roads.push({ x: 0, y: CFG.HIGHWAY_Y - CFG.HIGHWAY_W / 2, w: CFG.WORLD.w, h: CFG.HIGHWAY_W, vertical: false });
  for (const x of CFG.AVENUES) roads.push({ x: x - CFG.ROAD_W / 2, y: 0, w: CFG.ROAD_W, h: CFG.WORLD.h, vertical: true });
  for (const y of CFG.STREETS) roads.push({ x: 0, y: y - CFG.ROAD_W / 2, w: CFG.WORLD.w, h: CFG.ROAD_W, vertical: false });

  // Block columns/rows: the strips between roads, plus the outer margins.
  // The minus-edges and plus-edges are built in two groups, so sort them
  // before pairing — unsorted, the pairs cut across the roads themselves
  // and buildings end up standing in the middle of the highway.
  const edgesX = [0, ...CFG.AVENUES.map((x) => x - CFG.ROAD_W / 2), ...CFG.AVENUES.map((x) => x + CFG.ROAD_W / 2), CFG.WORLD.w].sort((a, b) => a - b);
  const edgesY = [0, CFG.HIGHWAY_Y - CFG.HIGHWAY_W / 2, CFG.HIGHWAY_Y + CFG.HIGHWAY_W / 2, ...CFG.STREETS.map((y) => y - CFG.ROAD_W / 2), ...CFG.STREETS.map((y) => y + CFG.ROAD_W / 2), CFG.WORLD.h].sort((a, b) => a - b);
  const cols = [];
  const rows = [];
  for (let i = 0; i < edgesX.length - 1; i += 2) cols.push([edgesX[i], edgesX[i + 1]]);
  for (let i = 0; i < edgesY.length - 1; i += 2) rows.push([edgesY[i], edgesY[i + 1]]);
  const blocks = [];
  for (const [x0, x1] of cols) for (const [y0, y1] of rows) blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });

  // Landmark buildings, placed by hand so the missions always find them.
  const truckStop = { x: 70, y: 800, w: 170, h: 100, color: '#b8543f', roof: '#8f3d2c', hgt: 14, landmark: 'truckstop' };
  const hospital = { x: 130, y: 180, w: 170, h: 110, color: '#e8e0d0', roof: '#c8c0b0', hgt: 18, landmark: 'hospital' };
  const barn = { x: 1230, y: 200, w: 140, h: 90, color: '#8a6a4a', roof: '#6a4a30', hgt: 16, landmark: 'barn' };
  const rustys = { x: 1950, y: 1420, w: 160, h: 100, color: '#5a6a7a', roof: '#3e4a58', hgt: 14, landmark: 'rustys' };
  const gasStation = { x: 650, y: 1100, w: 120, h: 80, color: '#d9a86c', roof: '#b87a4e', hgt: 12, landmark: 'gas' };
  const landmarks = { truckStop, hospital, barn, rustys, gasStation };

  // The plaza block (centre-north) stays open: fountain, no buildings.
  const plaza = { x: 475, y: 475, w: 750, h: 440 };
  // The quarry block (north-east corner) stays open for rock piles.
  const quarry = { x: 2275, y: 0, w: 325, h: 325 };

  const overlaps = (b, pad) => (x0, y0, x1, y1) =>
    b.x < x1 + pad && b.x + b.w > x0 - pad && b.y < y1 + pad && b.y + b.h > y0 - pad;
  const keepOut = [
    [plaza.x, plaza.y, plaza.x + plaza.w, plaza.y + plaza.h],
    [quarry.x, quarry.y, quarry.x + quarry.w, quarry.y + quarry.h],
    [truckStop.x, truckStop.y, truckStop.x + truckStop.w, truckStop.y + truckStop.h],
    [hospital.x, hospital.y, hospital.x + hospital.w, hospital.y + hospital.h],
    [barn.x, barn.y, barn.x + barn.w, barn.y + barn.h],
    [rustys.x, rustys.y, rustys.x + rustys.w, rustys.y + rustys.h],
    [gasStation.x, gasStation.y, gasStation.x + gasStation.w, gasStation.y + gasStation.h],
    [1120, 1090, 1180, 1150],
    [1420, 1090, 1480, 1150],
  ];

  // One or two adobe buildings per block, with a wide sidewalk margin.
  for (const [x0, x1] of cols) {
    for (const [y0, y1] of rows) {
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 120 || h < 120) continue;
      const count = w > 320 && h > 320 && rng() < 0.55 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const bw = Math.min(w - 68, 100 + rng() * 120);
        const bh = Math.min(h - 68, 80 + rng() * 100);
        const bx = x0 + 34 + rng() * Math.max(1, w - 68 - bw);
        const by = y0 + 34 + rng() * Math.max(1, h - 68 - bh);
        const b = { x: bx, y: by, w: bw, h: bh };
        if (keepOut.some(([a, c, d, e]) => overlaps(b, 10)(a, c, d, e))) continue;
        const color = PALETTE[Math.floor(rng() * PALETTE.length)];
        buildings.push({ ...b, color, roof: shade(color, -30), hgt: 8 + rng() * 18 });
      }
      // A cactus or two on the block's sidewalk edge.
      if (rng() < 0.6) {
        cacti.push({ x: x0 + 16 + rng() * Math.max(1, w - 32), y: y0 + 14, r: 8 + rng() * 5 });
      }
    }
  }
  buildings.push(truckStop, hospital, barn, rustys, gasStation);

  // Quarry rock piles (circles, solid).
  for (const [x, y, r] of [[2350, 120, 34], [2450, 200, 28], [2300, 260, 26], [2520, 150, 30], [2400, 90, 22]]) {
    rocks.push({ x, y, r });
  }
  // Gas pump islands (small solid rects) and crates by Rusty's.
  for (const [x, y, w, h, color] of [
    [700, 1095, 22, 42, '#c8c8c8'], [760, 1095, 22, 42, '#c8c8c8'],
    [1880, 1500, 56, 30, '#7a5a3a'], [1880, 1540, 56, 30, '#5a6a7a'],
  ]) obstacles.push({ x, y, w, h, color });

  // Road graph: intersections plus the highway ends, the truck stop and
  // the quarry track. Edges run along roads only.
  const nodes = [
    { x: 0, y: 1000 }, { x: 200, y: 1000 },
    { x: 400, y: 400 }, { x: 400, y: 1000 }, { x: 400, y: 1600 },
    { x: 1300, y: 400 }, { x: 1300, y: 1000 }, { x: 1300, y: 1600 },
    { x: 2200, y: 200 }, { x: 2200, y: 400 }, { x: 2200, y: 1000 }, { x: 2200, y: 1600 },
    { x: 2400, y: 200 }, { x: 2600, y: 1000 },
  ];
  const edges = [];
  const addEdge = (a, b) => { edges.push([a, b]); };
  // Highway chain (y = 1000).
  addEdge(0, 1); addEdge(1, 3); addEdge(3, 6); addEdge(6, 10); addEdge(10, 13);
  // Avenues (x = 400 / 1300 / 2200).
  addEdge(2, 3); addEdge(3, 4);
  addEdge(5, 6); addEdge(6, 7);
  addEdge(8, 9); addEdge(9, 10); addEdge(10, 11);
  // Streets (y = 400 / 1600).
  addEdge(2, 5); addEdge(5, 9);
  addEdge(4, 7); addEdge(7, 11);
  // Quarry dirt track.
  addEdge(8, 12);

  // Ammo crates and the hospital heal spot: fixed, on open ground.
  const ammoCrates = [
    { x: 600, y: 500 }, { x: 2000, y: 500 }, { x: 600, y: 1500 }, { x: 1500, y: 1500 },
  ];

  return {
    buildings, roads, blocks, cacti, rocks, obstacles, nodes, edges, plaza, quarry,
    landmarks, ammoCrates,
    hospitalDoor: { x: 300, y: 400 },
    barnDoor: { x: 1300, y: 320 },
    quarryMarker: { x: 2400, y: 200 },
    rustyDoor: { x: 2050, y: 1600 },
    truckStopSpot: { x: 250, y: 960 },
  };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// True when a point sits on a road (used to spawn cars and peds safely).
export function onRoad(x, y) {
  if (Math.abs(y - CFG.HIGHWAY_Y) <= CFG.HIGHWAY_W / 2 - 6) return true;
  for (const ax of CFG.AVENUES) if (Math.abs(x - ax) <= CFG.ROAD_W / 2 - 6) return true;
  for (const sy of CFG.STREETS) if (Math.abs(y - sy) <= CFG.ROAD_W / 2 - 6) return true;
  return false;
}

// Nearest graph node to a point.
export function nearestNode(city, x, y) {
  let best = 0;
  let bd = Infinity;
  city.nodes.forEach((n, i) => {
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// BFS over the road graph; returns a waypoint list from start to target.
// The exact target point is appended, so short off-road hops (a landmark
// door a few dozen pixels from its node) still work.
export function findRoute(city, fx, fy, tx, ty) {
  const start = nearestNode(city, fx, fy);
  const goal = nearestNode(city, tx, ty);
  const adj = city.nodes.map(() => []);
  for (const [a, b] of city.edges) { adj[a].push(b); adj[b].push(a); }
  const prev = new Array(city.nodes.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const nb of adj[cur]) if (prev[nb] === -1) { prev[nb] = cur; queue.push(nb); }
  }
  const path = [];
  if (prev[goal] === -1) return [{ x: tx, y: ty }];
  let cur = goal;
  while (cur !== start) { path.unshift(city.nodes[cur]); cur = prev[cur]; }
  path.unshift(city.nodes[start]);
  // Prune collinear middle points so the route never doubles back.
  const pruned = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = pruned[pruned.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > 1) pruned.push(b);
  }
  pruned.push(path[path.length - 1]);
  pruned.push({ x: tx, y: ty });
  return pruned;
}
