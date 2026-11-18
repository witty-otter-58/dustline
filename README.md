# Dustline

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/witty-otter-58/dustline/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/witty-otter-58/dustline/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Dustline is an open-world crime game in a sun-baked desert highway town.
You are Rosa Vega, a trucker-for-hire who owes the wrong people. Haul a
load to the quarry in the heavy truck, steal two marked cars for Rusty's
chop shop, then lose a five-star manhunt in a dust storm and make it home
to The Barn. Explore on foot or behind the wheel, dodge traffic and
pedestrians, outrun the police, and watch the wanted stars.

Open `game/index.html` in a desktop browser — it plays fully offline, no
network requests, no build step. Sound is synthesized with WebAudio.

## How to play

- **WASD / arrows** move on foot, drive in a vehicle
- **E** enter &amp; exit the nearest vehicle (stealing one raises your wanted level)
- **Mouse** aim, **click** shoot the pistol (12-round mag, auto reload)
- **P** pause, **M** mute, **R** restart — progress saves automatically

## The town

A long east-west highway with a truck stop at the west end, a quarry in
the north-east, a dusty plaza, a gas station, Rusty's chop shop in the
south-east, a hospital in the west, and The Barn safehouse up north. Dust
storms roll in on a cycle and close the visibility down to a haze ring
around you.

## Files

- `game/index.html` — page, HUD and overlays
- `game/src/config.js` — every tuning number
- `game/src/random.js` — seeded RNG
- `game/src/audio.js` — synthesized sound effects, engine hum, storm wind
- `game/src/city.js` — roads, blocks, adobe buildings, landmarks, road graph
- `game/src/world.js` — state, player, vehicles, peds, police, wanted, missions, storm
- `game/src/render.js` — canvas drawing and the minimap
- `game/src/input.js` — keyboard/mouse and the screenshot autopilot
- `game/src/shots.js` — `?shot=` staging (title/drive/chase/mission)
- `game/src/main.js` — shell, loop, HUD, overlays, save/load
