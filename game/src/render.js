// Canvas drawing: desert town, vehicles, people, storm, minimap.
import { CFG } from './config.js';
import { PHASE, currentMarker } from './world.js';

export function render(ctx, state) {
  const cam = state.camera;
  const ox = cam.x - CFG.W / 2;
  const oy = cam.y - CFG.H / 2;
  ctx.save();
  ctx.translate(-ox, -oy);

  // Sand ground.
  ctx.fillStyle = CFG.COLORS.sand;
  ctx.fillRect(ox - 10, oy - 10, CFG.W + 20, CFG.H + 20);
  // Speckles for texture (seeded positions, drawn cheaply).
  ctx.fillStyle = 'rgba(120,90,50,0.25)';
  for (let i = 0; i < 260; i++) {
    const sx = ((i * 7919) % CFG.WORLD.w);
    const sy = ((i * 104729) % CFG.WORLD.h);
    if (sx < ox - 5 || sx > ox + CFG.W + 5 || sy < oy - 5 || sy > oy + CFG.H + 5) continue;
    ctx.fillRect(sx, sy, 3, 3);
  }

  const city = state.city;
  // Plaza: packed earth with a fountain.
  ctx.fillStyle = CFG.COLORS.plaza;
  ctx.fillRect(city.plaza.x, city.plaza.y, city.plaza.w, city.plaza.h);
  ctx.fillStyle = '#7ab8c9';
  ctx.beginPath();
  ctx.arc(850, 695, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a8a9a';
  ctx.beginPath();
  ctx.arc(850, 695, 12, 0, Math.PI * 2);
  ctx.fill();

  // Roads: asphalt with dashed centre lines and dusty shoulders.
  for (const r of city.roads) {
    ctx.fillStyle = CFG.COLORS.road;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = CFG.COLORS.roadEdge;
    if (r.vertical) {
      ctx.fillRect(r.x, r.y, 4, r.h);
      ctx.fillRect(r.x + r.w - 4, r.y, 4, r.h);
    } else {
      ctx.fillRect(r.x, r.y, r.w, 4);
      ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4);
    }
    ctx.strokeStyle = '#d9c890';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 22]);
    ctx.beginPath();
    if (r.vertical) { ctx.moveTo(r.x + r.w / 2, r.y); ctx.lineTo(r.x + r.w / 2, r.y + r.h); }
    else { ctx.moveTo(r.x, r.y + r.h / 2); ctx.lineTo(r.x + r.w, r.y + r.h / 2); }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Quarry: pale gravel patch with rock piles.
  ctx.fillStyle = '#cbb894';
  ctx.fillRect(city.quarry.x, city.quarry.y, city.quarry.w, city.quarry.h);
  for (const rock of city.rocks) {
    ctx.fillStyle = '#8a7a62';
    ctx.beginPath();
    ctx.arc(rock.x, rock.y, rock.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a89a7e';
    ctx.beginPath();
    ctx.arc(rock.x - 6, rock.y - 6, rock.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buildings: adobe blocks with a roof slab and a shadow.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(60,40,20,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 10, b.y + b.h - 10, b.w - 20, 5);
    if (b.landmark) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const label = { truckstop: 'TRUCK STOP', hospital: 'HOSPITAL', barn: "THE BARN", rustys: "RUSTY'S", gas: 'GAS' }[b.landmark];
      ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }

  // Obstacles: gas pumps and crates.
  for (const o of city.obstacles) {
    ctx.fillStyle = o.color;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(o.x, o.y, o.w, o.h);
  }

  // Cacti.
  for (const c of city.cacti) {
    ctx.fillStyle = '#4a7a3a';
    ctx.fillRect(c.x - 3, c.y - c.r, 6, c.r * 2);
    ctx.fillRect(c.x - c.r, c.y - c.r * 0.4, 5, 4);
    ctx.fillRect(c.x + c.r - 5, c.y - c.r * 0.7, 5, 4);
  }

  // Ammo crates.
  for (const c of state.crates) {
    if (c.taken) continue;
    ctx.fillStyle = '#3a5a3a';
    ctx.fillRect(c.x - 11, c.y - 11, 22, 22);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', c.x, c.y + 5);
  }

  // Mission marker: pulsing yellow ring + beacon.
  const marker = currentMarker(state);
  if (marker && state.phase === PHASE.PLAY) {
    const pulse = 1 + 0.25 * Math.sin(state.time * 4);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vehicles.
  for (const v of state.vehicles) drawVehicle(ctx, state, v);
  // Police officers on foot.
  for (const u of state.police) {
    if (u.unit !== 'officer') continue;
    ctx.fillStyle = '#1a2a4a';
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(u.x, u.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pedestrians.
  for (const ped of state.peds) {
    if (ped.state === 'down') {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 12, 6, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, ped.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c8a0';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player on foot (not in a vehicle).
  const p = state.player;
  if (!p.inVehicle && state.phase !== PHASE.TITLE) {
    ctx.fillStyle = '#c94a3a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22);
    ctx.stroke();
  }

  // Bullets.
  ctx.strokeStyle = '#ffe9a0';
  ctx.lineWidth = 2;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life * 2);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x, pt.y, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Storm dust motes.
  if (state.storm.active) {
    ctx.fillStyle = 'rgba(200,160,100,0.5)';
    for (const d of state.dust) {
      ctx.globalAlpha = Math.max(0, Math.min(0.6, d.life * 0.4));
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Dust storm haze: a ring that closes in around the player.
  if (state.storm.active) {
    const px = p.x - ox;
    const py = p.y - oy;
    const g = ctx.createRadialGradient(px, py, 200, px, py, 520);
    g.addColorStop(0, 'rgba(210,170,110,0)');
    g.addColorStop(1, 'rgba(190,145,85,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
  }

  // Off-screen objective arrow.
  if (marker && state.phase === PHASE.PLAY) {
    const mx = marker.x - ox;
    const my = marker.y - oy;
    if (mx < 0 || mx > CFG.W || my < 0 || my > CFG.H) {
      const cx = Math.max(30, Math.min(CFG.W - 30, mx));
      const cy = Math.max(30, Math.min(CFG.H - 30, my));
      const a = Math.atan2(my - CFG.H / 2, mx - CFG.W / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawMinimap(ctx, state);
}

function drawVehicle(ctx, state, v) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);
  if (v.wrecked) ctx.globalAlpha = 0.55;
  // Shadow.
  ctx.fillStyle = 'rgba(60,40,20,0.3)';
  ctx.fillRect(-v.w / 2 + 3, -v.h / 2 + 4, v.w, v.h);
  // Body.
  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.roundRect(-v.w / 2, -v.h / 2, v.w, v.h, 6);
  ctx.fill();
  // Windshield + rear window.
  ctx.fillStyle = 'rgba(180,220,235,0.85)';
  ctx.fillRect(v.w / 2 - 12, -v.h / 2 + 3, 7, v.h - 6);
  ctx.fillRect(-v.w / 2 + 5, -v.h / 2 + 3, 6, v.h - 6);
  // Wheels.
  ctx.fillStyle = '#1a1a1a';
  const wx = v.w / 2 - 10;
  const wy = v.h / 2 - 1;
  ctx.fillRect(-wx - 6, -wy - 3, 12, 5);
  ctx.fillRect(wx - 6, -wy - 3, 12, 5);
  ctx.fillRect(-wx - 6, wy - 2, 12, 5);
  ctx.fillRect(wx - 6, wy - 2, 12, 5);
  if (v.kind === 'truck') {
    // Cargo box.
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(-v.w / 2 + 2, -v.h / 2 + 3, v.w - 22, v.h - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(-v.w / 2 + 2, -v.h / 2 + 3, v.w - 22, v.h - 6);
  }
  if (v.kind === 'police') {
    // Flashing light bar.
    const on = Math.floor(state.time * 6) % 2 === 0;
    ctx.fillStyle = on ? '#ff2a2a' : '#2a6aff';
    ctx.fillRect(-8, -v.h / 2 - 3, 16, 5);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
  }
  if (v.missionMark) {
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-v.w / 2 - 4, -v.h / 2 - 4, v.w + 8, v.h + 8, 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMinimap(ctx, state) {
  const mw = 180;
  const mh = 135;
  const mx = CFG.W - mw - 10;
  const my = 10;
  const sx = mw / CFG.WORLD.w;
  const sy = mh / CFG.WORLD.h;
  ctx.save();
  ctx.fillStyle = 'rgba(20,14,8,0.72)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#8a7a5a';
  ctx.strokeRect(mx, my, mw, mh);
  // Roads.
  ctx.fillStyle = '#6a5a48';
  for (const r of state.city.roads) {
    ctx.fillRect(mx + r.x * sx, my + r.y * sy, Math.max(1, r.w * sx), Math.max(1, r.h * sy));
  }
  // Mission marker.
  const marker = currentMarker(state);
  if (marker) {
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(mx + marker.x * sx, my + marker.y * sy, 4 + Math.sin(state.time * 4), 0, Math.PI * 2);
    ctx.fill();
  }
  // Traffic dots.
  ctx.fillStyle = '#c9c9c9';
  for (const v of state.vehicles) {
    if (v.driver === 'traffic') ctx.fillRect(mx + v.x * sx - 1, my + v.y * sy - 1, 2, 2);
  }
  // Police dots.
  ctx.fillStyle = '#ff2a2a';
  for (const u of state.police) ctx.fillRect(mx + u.x * sx - 1.5, my + u.y * sy - 1.5, 3, 3);
  // Player arrow.
  const p = state.player;
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}
