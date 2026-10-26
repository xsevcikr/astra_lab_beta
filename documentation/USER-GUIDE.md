# User guide

## 1. The workflow

**Design → plan → simulate → watch → analyse → improve.** Every step has its own screen; the AI engineer can do the whole loop for you.

## 2. Vehicle Designer

* **Left**: the vehicle list (New / Rename / Duplicate / Delete) and the component tree grouped by stage, fairing, payload. *Add component* opens the catalogue (propulsion, tanks, structure, avionics, power, thermal, communications, instruments, landing, rover parts). *Create stage* builds a complete stage (engines, tanks, interstage) from a few numbers.
* **Centre**: 3D view. Drag to rotate, wheel to zoom, click a part to select it. The seven camera modes: **Free orbit**, **Chase**, **Onboard**, **Ground tracking**, **Top-down**, **Side view**, **Orbital map**. Below the view: total mass, liftoff thrust-to-weight, delta-v (vacuum and estimate for launch), size, stage table, design warnings.
* **Right**: inspector for the selected component (all its parameters with units, data label, remove/duplicate). Turn on *Educational mode* in Settings to see the rocket equation with your numbers.
* **Mouse editing (new in 1.1):** click a part to select it. Drag the selected part along the vehicle to move it (it swaps places with its neighbour, inside its own stage only). Two round handles appear on it: **↕** drags the length, **↔** drags the diameter (tanks keep their propellant volume, so a longer tank holds more propellant when you change the length). Hold Shift while dragging to rotate the camera instead. Each drag is one undo step.
* Mass, centre of gravity and delta-v update as you edit. Changes are one undo step each (Ctrl+Z / Ctrl+Y).

## 3. Mission Planner

A mission is an ordered list of **events**: *when* (a condition such as "at T+0", "altitude ≥ 105 km", "propellant of stage 1 ≤ 0.4 %", "1.2 s after event X", combinations with AND/OR) and *what* (ignite, shut down, separate a stage or the fairing, deploy payload/panels/rover, set guidance mode, burn a given delta-v, set throttle, end the mission). Also: target orbit or objective, time limit, the **ascent pitch programme** (turn altitude and exponent), the environment (Earth/Moon/Mars, launch site) and **injected faults** (engine failure, antenna failure …) to test how a design reacts.

## 4. Simulation and Mission Control

* **Simulation → Run simulation** computes the whole flight as fast as possible, records it and shows the verdict. *Try several ascent pitch programmes* lets the engine test up to 12 programmes and keep the first that reaches orbit.
* **Mission Control** runs the same physics in real time or at 0.1×–100×. Watch in 3D, read the HUD, send manual commands (they are recorded), see failures the moment they are detected. Pause, stop, restart. When it ends the run is recorded and you can open the analysis or the replay.

## 5. Telemetry, Replay, Analysis

Jettisoned stages and fairings keep flying after separation. You see them fall away in Mission Control and Replay, and **Engineering Analysis → Metrics & timeline** and the report list where each piece comes down (time, latitude/longitude, downrange distance, speed) or which orbit it stays in.

* **Telemetry**: choose channels (presets or free), several graphs, hover for values, CSV export. Works while a live run is in progress.
* **Replay**: Play/Pause (space bar), Restart, ±5 s, scrubber with event and failure markers, speed 0.1×–100×, camera modes, HUD and graphs synchronised. Click an event to jump there.
* **Engineering Analysis**: verdict, failure records (confidence, cause, evidence, equation, consequences, solutions), findings, delta-v budget (delivered, gravity, drag, steering losses), metrics, timeline, **comparison of two runs**, and reports: **PDF**, **HTML** (printable), **CSV** (telemetry and metrics).

## 6. AI Engineer

Examples: `Build me a two-stage rocket carrying a 100 kg space probe.` · `Test it.` · `Why did it fail?` · `Fix it.` · `Fix it and keep trying until it works.` · `Add 10% propellant to the second stage.` · `Change the orbit to 400 km.` · `Compare the last two runs.` · `Vary the second stage propellant from 80% to 120%.` · `What is Max-Q?` · `Build me a rover for the Moon.` · `Build a lander carrying a 150 kg rover.` · `Save the project.` · `Undo.`

Proposals show the steps and the predicted design; **Approve & apply**, **Edit** (drop steps or change arguments) or **Cancel**. Nothing changes before you approve.

## 7. Experiment Lab

Pick parameters (propellant of a stage, payload mass, engine thrust, target altitude, pitch programme …), ranges and number of steps, and an objective ("minimise propellant used among successful cases"). Every combination is flown for real. Results: table, plot, best case, *Apply this case to my design*, CSV.

**Reliability study (Monte Carlo, new in 1.1).** Below the sweep. It answers “how likely is this design to work?”. The design is flown 5 to 200 times; in each run engine thrust, Isp, propellant loaded and structural mass are multiplied by random factors around 1 (you can change the 1σ percentages and switch inputs off). Result: success probability with a 95 % confidence interval, the spread of the results as a histogram and table, the failure modes seen, and which input the outcome depends on most. The seed makes it reproducible; CSV export is included. The AI engineer does the same when you ask “How reliable is it? Run a Monte Carlo study with 30 runs”.

## 8. Projects and Settings

Projects are folders of JSON files in `Documents\ASTRA-LAB\projects`. Autosave runs a few seconds after each change; Ctrl+S saves immediately. *Export bundle* writes vehicles, missions and environment into one file to share; *Import bundle* reads one. Settings: units, educational mode, data labels, 3D quality, frame-rate limit, physics accuracy, AI connection.

## 9. Keyboard

Ctrl+S save · Ctrl+Z undo · Ctrl+Y or Ctrl+Shift+Z redo · Space play/pause in Replay · F11 full screen · Ctrl +/- zoom the interface.


## Beginner, Standard and Advanced (new in 1.2.0)

The **Detail** switch at the top right controls how much information you see. *Beginner* (default) shows the six main steps in plain words: Home, Academy, AI Helper, Build a rocket, Launch it, What happened? *Standard* adds numbers, tables and graphs. *Advanced* shows everything (all tools, accuracy options, commands). Change the text size in Settings.

A first session for a student: Academy → *Level 1* → *Home* → **Let the AI build a rocket** → **Launch it** → **What happened?** → **Explain what happened**.

## New in 2.0
- **Test bench ("Will it work?")**, in the menu after the builder. Each card is a ready-made design with a goal. **Test it** flies it in a separate session (your project is not changed) and shows PASS or FAIL with the reason and a few numbers. **Watch it fly** loads it and opens Launch; **Open it** loads it into the builder. **Test my design** checks your active design and mission.
- **Sharing.** Press **Share** in the builder, on Home or on the Test bench. *Copy link* puts an `astralab://design/...` link on the clipboard; clicking it on a computer with ASTRA LAB installed opens the app and asks before adding the design. If a chat app does not make the link clickable, the receiver pastes it into *Open a design someone sent you*. *Save as file* writes `<name>.astra-design.json`. Whole projects still use Projects > Export bundle.
- **Cameras and view.** The camera menu in Launch and Replay has **Director**, which picks shots by flight phase and cuts every 8 to 13 s. **Cinema** (or the F key, Esc to leave) hides the side panels and charts. **Less data / More data** slims the HUD to five readouts. Both settings are remembered.
- **Real-mission checks.** Validation > *Does it match real missions?* runs the orbit, Curiosity and Apollo 11 comparisons and shows each row with its source.

## New in 2.1
- **Weather and gravity.** Mission Planner > Environment: wind speed (m/s), the compass direction it blows *from*, gusts and a seed, the air density as a percentage of standard, and a *Precise gravity (J2)* checkbox. All are off by default. A rocket in wind can break; that is a result, not an error: the model checks the bending load from the angle of attack.
- **Reliability study with weather.** Experiment Lab > Reliability study lists *Air density* and *Wind speed (random direction)* (marked *weather*, off until you tick them). Choose up to 500 flights. Each flight draws its own wind, so the result is the chance of success in a windy week, not on one day.
- **Traceability.** Replay shows the fingerprints of the inputs and results. *Re-run and verify* flies the run again from its recorded inputs and compares every sample. The mission report PDF lists the fingerprints, the gravity model and the weather.
- **Python and MATLAB.** Engineering Analysis > *Python script* and *MATLAB script* save a loader that plots the telemetry CSV saved next to it.
