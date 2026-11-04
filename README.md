# Endless Road

A desert survival driving game made by Louis (with a little help from Claude).

Pick a world (Desert, Snowy Mountains or Jungle) and a mode (Survival or Sandbox), then drive as far as you can. Scavenge abandoned houses and wrecked cars for food, fuel, tools, spare parts and CDs for the radio.

**Play:** https://play.endlessroad.co.za

## Controls
- **Drive:** W A S D or arrows, Space handbrake, H heater
- **Walk:** W A S D, Shift run, Space jump
- **Look around:** click the game, then move the mouse. V switches first-person / third-person
- **E:** get in/out, open doors and bonnets, pick things up, fit parts. **Hold E** to take a part off
- **G:** drop · **1 to 4:** hotbar · **F:** eat or play a CD
- **R:** radio · **N:** next song · **[ ]** volume · **M:** sandbox menu · **P:** pause

## How it's built
Plain HTML and JavaScript with [three.js](https://threejs.org) for 3D. All models, textures and music are generated in code.

- `js/core.js` settings, terrain maths, renderer, textures, materials
- `js/radio.js` the car radio and CD player (music generated live)
- `js/vehicles.js` sedan, pickup and buggy, engine bay, dashboard, the player
- `js/world.js` endless world: roads, houses, wrecks, power lines, weather
- `js/game.js` gameplay, controls, cameras, HUD and the sandbox menu

Open `index.html` in a browser to play locally.
