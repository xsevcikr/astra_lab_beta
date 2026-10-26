# Architecture

```
            ┌──────────────────────────── Electron main process (src/main/main.cjs) ───────────────────────────┐
            │  window · app:// protocol (allow-list) · disk bridge (data folder only) · secret store · AI fetch │
            └───────────────▲──────────────────────────────────────────────────────────────────────────────────┘
                            │ preload.cjs  (contextBridge, no Node in the renderer)
 ┌──────────────────────────┴───────────────────────────── renderer (ui/) ───────────────────────────────────────┐
 │  screens (home, designer, planner, simulation, control, telemetry, replay, analysis, ai, experiments, ...)    │
 │  ui/lib: App state · WebGL renderer + scene · charts · widgets · storage adapter                              │
 └───────┬───────────────────────────────┬───────────────────────────────────────────────┬──────────────────────┘
         │ tool calls                    │ project/run I/O                               │ read-only results
 ┌───────▼────────┐             ┌────────▼─────────┐                           ┌─────────▼────────┐
 │ ai/  (20 tools │             │ src/core         │                           │ physics/         │
 │ plans, engineer│────────────►│ project, storage │──────────────────────────►│ RK4 simulation,  │
 │ LLM provider)  │  RUN_SIM…   │ runner, reports  │      Simulation           │ failures, telemetry
 └────────────────┘             └──────────────────┘                           └──────────────────┘
```

## Rules that keep it honest

1. **Physics is authoritative and headless.** `physics/` has no DOM, no Electron and no rendering. The 3D view reads telemetry samples; it can be turned off without changing any result.
2. **One code path per operation.** The UI's Run button, the AI's `RUN_SIMULATION`, the experiment lab and the headless demo call the same functions.
3. **Vehicle definitions are JSON data**, never mutated by the simulator (runtime state lives in `FlightVehicle`).
4. **Recorded runs are self-contained**: vehicle, mission, environment, settings, commands, events, result, telemetry. They can be replayed, analysed and exactly re-simulated years later.
5. **The renderer is untrusted with the disk and network**: all access goes through validated IPC in the main process.

## Storage layout (`Documents\ASTRA-LAB`)

```
projects/<name>/project.json         manifest: runs index, experiments, memory (aliases, notes)
projects/<name>/vehicles/<id>.json   vehicle definitions
projects/<name>/missions/<id>.json   mission definitions
projects/<name>/environment.json
projects/<name>/versions.json        undo/redo + version history (design snapshots)
projects/<name>/ai-history.json      conversation with the engineer
projects/<name>/simulations/<run>/   run.json (inputs, events, result), telemetry.bin.gz (columnar float64), replay.json
settings/app.json                    application settings (no secrets)
exports/  logs/
```

## Telemetry

Columnar `Float64Array` per channel (77 channels, see `physics/telemetry.js`), bounded memory by in-place decimation when a run exceeds the configured maximum, linear interpolation (quaternion slerp) for replay, gzip-compressed binary on disk, CSV export.

## 3D renderer

A small WebGL 1 renderer (`ui/lib/gl.js`, `scene.js`): one shared canvas, floating origin (everything is drawn relative to the vehicle so that coordinates near a planet do not lose precision), a far pass (stars, planet with procedural shader, atmosphere, trajectory, orbit) and a near pass (ground patch, pad, vehicle, exhaust) with a depth clear between them. Seven camera modes: free orbit, chase, onboard, ground tracking, top-down, side view, orbital map.
