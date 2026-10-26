# ASTRA LAB

**An offline aerospace engineering laboratory for Windows.** Design rockets, probes, landers, satellites and rovers, plan a mission, fly it in a real physics simulator (RK4, six degrees of freedom, variable mass, atmosphere, staging, orbital mechanics), watch it live in 3D, replay it, find out *why* it failed and let the built-in AI engineer fix it.

No account, no cloud and no internet connection are needed. An optional online AI model can be connected in **Settings**.

> ASTRA LAB is a simplified engineering laboratory for design studies, education and rapid what-if analysis. Its results show what the documented model predicts for the inputs you give. They are **not** flight-certification results. See `documentation/KNOWN-LIMITATIONS.md` for what the model does and does not cover, and `documentation/DATA-LABELS.md` for what the *Real / Estimated / User-created / Fictional* labels mean.

## New in 2.3 (see CHANGELOG-2.3.md)
- Missions run to the end: Apollo comes home with a lifting entry, parachutes and splashdown.
- A simple first page with a turning 3D Earth and big portals; the Explore Beyond look on every screen.
- Thrust curves, optional slosh and flex, linked Monte Carlo inputs, CCSDS/SPICE import and export, and an opt-in update check (Settings > Updates).

## New in 2.1 (scientist tools, found and fixed mistakes)
- **Weather:** Mission Planner > Environment now has wind (speed, direction, gusts, seed) and air density. The wind is a jet-stream profile, strongest at 12 km, and the same seed always gives the same flight.
- **Reliability studies with weather:** the Monte Carlo study (Experiment Lab) can now disperse wind and air density as well as thrust, Isp, propellant and mass, and runs up to 500 flights.
- **Precise gravity (J2):** a checkbox for the Earth's equatorial bulge. **Fixed a real mistake**: in 1.9 and 2.0 this term was about ten million times too weak and did nothing (it was off by default, so earlier results are unchanged). A new check flies a satellite for a day and compares its orbit drift with a Sun-synchronous orbit (0.9856 deg/day, simulated 0.9851) and the space station (about -5.0, simulated -4.97).
- **Repeatable runs:** every run carries an input fingerprint, a result fingerprint, the gravity and weather it used; **Replay > Re-run and verify** flies it again and checks every sample; the PDF report lists them.
- **Your own tools:** Python and MATLAB/Octave scripts that load and plot the exported telemetry.
- **Presenting:** `PRESENTATION-GUIDE.md` is a 10-minute demo script. Apollo 11 times now show as h:mm:ss like the Mission Report.

## New in 2.0 (checked against real missions, one-click tests, sharing, new graphics)
- **Does it match real missions?** The physics is compared with published numbers from Falcon 9, Apollo 11, Curiosity on Mars, the ISS, geostationary orbit and the planets' escape speeds. Falcon 9 now passes 8 of 8 rows, Apollo 11 7 of 7 (TLI to entry interface), orbits 8 of 8. Where the model still disagrees (Curiosity touches down 43 s early, Saturn V Max-Q) it says so. See **Validation** and `documentation/VALIDATION.md`.
- **Will it work?** A new **Test bench** screen. Pick an example rocket, probe, lander or rover and press **Test it**: it really flies in the simulator, then shows **PASS** or **FAIL** with one plain sentence why ("It hit the ground at 38 m/s..."). Three examples are broken on purpose so you can see what failure looks like. **Test my design** does the same for your own design.
- **Share designs:** **Share** in the builder, on Home and on the Test bench. Copy a link (`astralab://design/...` opens ASTRA LAB), a code for chat apps, or save an `.astra-design.json` file. Opening a shared design always asks first and adds it as a new design.
- **Graphics:** real NASA imagery of the Earth (Blue Marble day, Black Marble city lights at night, shiny oceans, relief) and the Moon (LRO), a filmic colour curve, a **Director** camera that cuts between shots like a launch broadcast, exhaust that looks like the propellant (blue hydrogen, orange kerosene, white solid smoke), a **Cinema** view (F key) and a slimmer glass HUD (**Less data**).
- **Automated tests on every change:** `.github/workflows/tests.yml` runs all unit tests on Windows and Linux and the UI tests in a real browser on every push and pull request. `npm run test:all` runs everything locally.
- Screenshots of the new features are in `documentation/screenshots-2.0/`. Full list of changes: `CHANGELOG-2.0.md`.

## New in 1.9.1 (fixes)
- **Landing:** the height readout and the 3D ground now use the real ground (the Moon has hills and craters), so the lunar module no longer sinks "-50 m" into the surface. It stands on the ground at 0 m.
- **Never black:** near a surface the Sun is kept at least about 25 degrees up in the picture (visual only), and there is always a soft earth-shine fill light. Turn the always-bright view off with `localStorage.setItem('astra.dayAssist','0')`.
- **Cameras:** Onboard now looks out from the tip of the nose (it used to sit inside the hull of the docked ship). Ground tracking works at the Moon (a fixed camera on the surface near the lander) instead of staying at the Earth launch site.
- **Builder:** the backdrop is now space with the Earth's bright limb, atmosphere glow and stars, like a photo of a rocket in orbit.

## New in 1.9 (Apollo 11 Moon rocket)
The Moon rocket mission now follows the real Apollo 11 profile. Open **Academy > Guides > Saturn V Moon rocket** (or *Examples > Saturn V Moon rocket*).
- **The rocket:** a Saturn V-style stack, about 110 m tall: S-IC, S-II and S-IVB, then the instrument unit, the lunar module (LM) inside the conical adapter, the command/service module (CSM) and the launch escape tower. The adapter is drawn see-through so you can see the LM inside. No solar panels (fuel cells and batteries). The LM has a descent stage (legs, throttleable engine) and an ascent stage (cabin, small engine).
- **The flight (about T+ times):** Max-Q T+1:18, stage 1 off T+2:44, stage 2 off T+8:40, parking orbit about 185 km at T+11 min, coast 2-3 h, S-IVB second burn (TLI), adapter opens, CSM turns round, docks with the LM and pulls it out, coast about 3 days, lunar orbit insertion, LM descent with throttling to touchdown at about T+103 h (7.7 % descent propellant left), liftoff, rendezvous and docking, ascent stage dropped, trans-Earth injection, entry interface at about T+178 h.
- **Fuel per stage and vehicle:** the Fuel and Push readouts follow the active stage or spacecraft. Key moments use mission hours and minutes.
- **Time warp:** 1x to 10000x. The app slows itself down for burns, separations, docking and landing, and caps the warp to what your computer can do (no more "Too fast for this computer" for long missions).
- **Graphics:** new Saturn V livery, CSM, LM, escape tower, S-IVB and adapter models; transposition and docking playback; pad lights at dawn.
- Code: `ui/lib/apollo-geo.js`, `src/vehicles/apollo.js`, `src/missions/apollo.js`, `data/apollo-plans.js` (re-run `scripts/update-apollo-plans.mjs` after changing the rocket or physics). Tests: `tests/apollo.test.js` flies the whole mission.

## New in 1.8 (Moon rocket)
Build a rocket that takes a **rover** or a **lunar module** to the Moon, like Apollo 11. Open **Academy > Guides** and pick *How to build a rocket that takes a rover to the Moon* or *How to build an Apollo-style rocket for a lunar module*. Each guide builds the whole ship step by step with real buttons (Undo works). *Examples* has both finished ships (*Moon rocket (rover)*, *Moon rocket (lunar module)*).
- **The ship:** 5 m wide, three stages (kerolox, kerolox, hydrogen), a service module (course corrections, braking into lunar orbit) and a lander under the fairing.
- **The flight:** launch, 185 km parking orbit, burn toward the Moon, two course corrections, lunar orbit, deorbit, powered landing, rover drive-off. About 5 simulated days. In Mission Control pick a high time warp (1000x to 100000x; a slow computer simply gets less).
- **How it is planned:** `physics/lunar-transfer.js` finds the launch time and burn start for the Earth-Moon geometry; the course corrections are computed on board during the flight; the simulator flies the real result. Tests fly both ships all the way to the surface (`tests/moonrocket.test.js`).
- New tools for the AI Helper and guides: `CREATE_SERVICE_MODULE`, `CREATE_LANDER` with `forMoonRocket`, `CREATE_MISSION` kind `moon`.
- Limits (honest list): no return to Earth; no docking or turn-around of the lunar module; the crew cabin is mass only (no crew, air or life support); transfer planning uses patched conics (the Moon's gravity acts only inside its sphere); the launch date is chosen by the planner, so the date is not Apollo's; the landing site is wherever the orbit leads, not a chosen site. Fixed along the way: multi-day flights no longer inherit the 12 h time limit, and engines of dropped stages no longer force coarse time steps.

## New in 1.7 (Engineering Workbench)
Open **Engineering Workbench** in the left menu (Beginner mode: *More tools*). It is a physics-backed engineering lab that sits next to the existing screens and does not change them:
- **Full lunar mission** (launch, trans-lunar injection, lunar orbit, powered descent, surface, ascent, rendezvous, return, entry) flown in about a second, with Mission Control consoles, event timeline, replay and failure injection.
- **Engineering loop:** requirements, design, calculation, analysis, simulation, verification, failure diagnosis and design change, with versions and a list of requirements to retest.
- Vehicle versions and diffs, engine test stand, wind tunnel, GNC and PID designer, sensors with fault diagnosis, power/thermal/comms, orbits, constellations, station builder, landing sites.
- Monte Carlo with confidence intervals, tornado sensitivity, sweeps, trade studies, the "lightest lunar lander" experiment.
- Requirements and traceability, reliability, FMEA, fault trees, risk dashboard, 33 physics benchmarks, reports (HTML/print to PDF, Markdown, JSON, CSV).
- AI Mission Director with Observe / Suggest / Simulate / Modify / Execute permission levels and approval for changes (offline command parser, no language model), Academy lessons that open real experiments, challenges and emergencies.
- Ctrl+K command palette, dark and light themes, save and open project. Every number is labelled physics, approx, simplified or visual only.

Code: `src/engineering/` (headless engine), `ui/engineering/` (workspaces), `ui/screens/engineering.js` (menu entry). Tests: `npm test` now also runs 90 engineering tests; `node tests/ui-engineering.mjs` drives the workbench in a browser. Limits: no 3D view in the workbench, time warp is not live, multi-vehicle has no UI, emergencies are scored but not flown.

## New in 1.6.1 (green lights you can trust)
- "Will it fly?" and Launch It now judge the rocket against its real goal, warn about too much thrust, and say they are a prediction.
- **Test fly** button: a real fast test flight with a plain result.
- **Fix it and fly again:** after a failed flight, one button adjusts fuel and engines from the real failure and flies again. It claims success only after a recorded successful flight.
- New rockets are test flown and fixed on creation. Live Flight uses the saved flight path and warns when the computer is too slow.

## New in 1.6.0 (simpler, cleaner, more realistic)
- Much less text in Beginner: short labels, one-line hints, details in "More" or higher detail levels. Academy lessons rewritten for a 12-year-old (original technical text under "Go deeper").
- Emoji removed everywhere; clean line icons only where needed.
- Graphics: shadows, better metal and paint shading, farmland ground, launch pad trench, exhaust, condensation cloud near Mach 1, lens flare, Moon and Mars crater relief, open parachute canopy during descent.

## New in 1.5.0 (professional upgrade, same simple start)
- **Bug fixes:** the AI now asks one question and shows "I understood..." before building (no more silent 100 kg probe for a Mars rover); the active rocket, goal and flight always match; speed at T+0 is 0 relative to the pad (the inertial value is labelled); no scientific notation for beginners; one-click fixes for missing tanks and other design errors; layouts checked at 1024x768, 1280x720, 1366x768 and 1920x1080; report-card grade now matches its stars.
- **Four detail levels:** Beginner, Student (formulas with your own numbers), Engineer (budgets, mass fractions, sensitivity) and Expert (raw telemetry, physics options, Monte Carlo, exports). Only the presentation changes, never the results. Metric / imperial toggle in the top bar.
- **Czech language** for the app shell, Home, Settings, challenge names and more (lessons and AI replies stay English).
- **Validation page:** Saturn V, Falcon 9 and Electron compared with published data, with honest pass/fail (see `documentation/VALIDATION.md`). `documentation/AUDIT.md` describes the physics. New calculators: plane change, launch windows, delta-v budget. An "Assumptions and limits" panel explains what each result includes and ignores.
- **Professional tools (More tools):** requirements checklist, trade studies, Monte Carlo with success probability and confidence interval, failure analysis with "Apply this fix and re-fly", a 7-page PDF mission report and CSV/JSON telemetry export.
- **Version history** with compare and restore, **teacher mode** (assignment files, class table), 8 **Pro challenges**, Academy "Try this now" buttons and glossary tooltips in lessons and AI replies.

## New in 1.4.0 (made simpler for a 15-year-old)
- **Much less text.** Short plain sentences, cards, icons and traffic lights. Extra detail hides behind "More" or the Standard / Advanced detail levels.
- **316 rocket parts** (110 new) in friendly groups, each with a one-line "best for / trade-off". Decouplers, grid fins, antennas, RCS pods, rover parts and more now draw in 3D.
- **Build guides:** 8 step-by-step guides (sounding rocket, small launcher, bigger launcher, probe, satellite, Moon lander, lander + rover, rover). Every step explains the part and builds it for you; every step can be undone.
- **Glossary** with 168 terms, tap any dotted word in a lesson.
- **"What your rocket still needs":** if a flight cannot start, you get a checklist that says what is missing, where to find it, a "Show me where" button and a "Fix it for me" button.
- **Simpler full editor:** icon cards, a part picker with search, Basics + "More settings", a "Will it fly?" traffic-light strip.
- **Flight data:** 6 big cards (speed, height, push, fuel, heat, orbit) with plain comparisons, a flight report card, simpler live flight HUD and "What if...?" experiments. Computed from the real run only.
- **AI Helper:** replies are short by default (under about 60 words), with a "Details" button for the full answer.
- **Home "Start here" path, 16 challenges with hints, Ctrl+K command palette, Help overlay, optional sounds, fun facts, progress report.**
- **Graphics pass 2:** better engine bells, nose cones, tanks, solar wings, rover wheels, landing legs, lit night side on the Orbital map.

## New in 1.3.0

* **More realistic graphics (all generated by the program, no downloads):** textured Earth, Moon and Mars (hand-drawn coarse continent outlines with clouds, ice caps, night-side city lights and ocean glint), blue sky that fades to black with altitude, atmosphere glow on the horizon, stars and Milky Way, a launch pad with tower and ground, rocket exhaust plume that changes with altitude, better lighting on the rocket. The *3D quality* setting (Low/Medium/High) scales texture size and effects for older laptops.
* **Simple Rocket Builder (Beginner mode):** name, payload, engine per stage, fuel slider and a live *Will it fly?* check. Click a part for *What is this?*. The full parts editor is one click away (*Open the full editor*).
* **Mission Planner for beginners:** pick a destination (100 / 200 / 400 / 1,000 km).
* **Launch Readiness Review:** a real Go / No-Go poll (Structures, Propulsion, Guidance, Power, Communications, Payload, Flight Director) computed from your design before launch.
* **Flight phase ribbon and callouts** in live flight (Liftoff, Max-Q, separation, engine cut-off, orbit ...), explained in plain words.
* **Challenges:** 10 missions (reach space, reach orbit, survive Max-Q, gentle ride, lightweight, efficient, heavy lift, high flyer, polar pioneer ...) with 1-3 stars awarded only from what the simulator measured.

## New in 1.2.0: made for students

* **Beginner mode (default).** Short sidebar (Home, Academy, AI Helper, Build a rocket, Launch it, What happened?), plain words, larger text, and only the numbers that matter. Every expert screen is one click away under **More tools**, and the **Detail** switch at the top (Beginner / Standard / Advanced) shows more information whenever you want it. Nothing is removed: it is only hidden until you ask.
* **Aerospace Academy.** 11 levels, 44 short lessons (definition, why it matters, plain explanation, diagram, the math on request, worked example, interactive experiment, common mistakes, summary, 3-question quiz) and a **Parts guide** that explains all 29 component types: what each part does, how it works, why it matters, advantages, limits and what every number means. Click *Learn more* in the Vehicle Designer to jump there. The AI Helper also answers “What does the fuel tank do?” or “Teach me about staging” from the Academy and links to the lesson. See `documentation/ACADEMY.md`.
* **Vehicle Designer view tools:** *Fit rocket*, *Reset view*, *Focus part*, zoom buttons, right-drag / Shift-drag to move the view; the whole rocket is framed automatically.
* **Live flight:** *Step 1 s* button while paused, warning when your computer cannot keep up with the chosen speed (default 1× = real time).

## What is inside

| Screen | What it does |
|---|---|
| **Home** | Create your first vehicle (Rocket, Spacecraft, Probe, Rover, Lander), open the AI engineer, load the demo project. |
| **Vehicle Designer** | Component tree, 3D editor with 7 camera modes, inspector for every component, live mass / centre of gravity / thrust-to-weight / delta-v per stage, design checks, educational equations. |
| **Mission Planner** | Timeline of events (condition → action), ascent pitch programme, target orbit, injected faults, environment (Earth, Moon, Mars). |
| **Simulation** | Run the physics engine (fast) with progress, results, run history. Optional automatic search over ascent pitch programmes. |
| **Mission Control** | Real-time (0.1× to 100×) live simulation with 3D view, HUD, manual commands (ignite, shut down, separate, throttle, guidance mode, abort) and live failure alerts. |
| **Telemetry** | Every recorded channel (77) as graphs; presets and free selection; CSV export. |
| **Replay** | Play, pause, restart, scrub, 0.1× to 100×, synchronised 3D view (jettisoned stages fall away as physics-propagated debris), graphs, event and failure markers. |
| **Engineering Analysis** | Verdict, failure records with **CONFIRMED / LIKELY / POSSIBLE** confidence, cause, evidence, governing equation and solutions; delta-v budget; run comparison; report export (PDF, HTML, CSV). |
| **AI Engineer** | Chat that builds, tests, diagnoses and improves designs through 20 validated tools. Every change is a proposal you approve, edit or cancel. Undo, redo and version history. |
| **Experiment Lab** | Parameter sweeps (table, plot, best case, CSV) and **Monte Carlo reliability studies**: success probability with a 95 % interval, result distributions and the inputs that matter most. Every case is a complete real simulation. |
| **Projects / Settings** | Local JSON projects, import/export, version history; units, performance, AI configuration. |

## Quick start (no installation)

1. Extract the ZIP (right-click, *Extract All...*). Do not run files from inside the ZIP.
2. Double-click **`START-ASTRA-LAB.bat`**. ASTRA LAB opens in its own window (it uses Microsoft Edge, which is part of Windows 10/11, or Google Chrome). No Node.js, no installer and no internet needed.
3. Optional: double-click **`CREATE-DESKTOP-SHORTCUT.bat`** once to put an ASTRA LAB icon on your desktop.

Where your work is stored: in this mode projects are kept in the app's own browser profile (`%LocalAppData%\ASTRA-LAB\browser-profile`). Use **Projects, Export** now and then to keep a backup file. The installed version (below) stores projects as normal files in `Documents\ASTRA-LAB`.

Troubleshooting: if nothing opens, install Google Chrome and try again. If the folder path contains special characters (for example accents), extract the ZIP to `C:\ASTRA-LAB` instead.

## Install (Windows 7/8/10/11, 64-bit)

1. Get the installer `ASTRA LAB Setup 1.3.0.exe` (optional; build it once with `installer-builder\BUILD-WINDOWS.bat`, see `BUILD-WINDOWS.md`, or download it from the *Actions* tab of the repository if you use the supplied GitHub workflow).
2. Run it. It installs to your user profile, adds a **desktop shortcut** and a Start-menu entry, and starts ASTRA LAB.
3. Projects are stored in `Documents\ASTRA-LAB\projects`, logs in `Documents\ASTRA-LAB\logs`.

A low-end laptop is enough: the physics runs on the CPU, the 3D view uses WebGL 1 with simple shaders. If the graphics driver is poor the app switches to software rendering by itself (see *Troubleshooting*).

## Run from source

Requirements: Node.js 18 or newer.

```bash
npm install          # installs Electron 22 and electron-builder (development only)
npm start            # starts the desktop application
npm test             # 46 automated tests (physics validation, AI, storage, reports, Electron main process)
npm run demo         # headless demo: the complete conversation, writes a PDF report
npm run serve        # run in a normal browser at http://127.0.0.1:8123/ (no installation, projects kept in the browser)
npm run dist         # build the Windows installer into build/dist
```

## Your first rocket in one minute

1. Start ASTRA LAB → **Home** → **ASK AI ENGINEER**.
2. Type: `Build me a two-stage rocket carrying a 100 kg space probe.`
3. The engineer shows a **proposal** (stages, engines, propellant, payload, mission). Press **Approve & apply**.
4. Type: `Test it.` A real simulation runs (a few seconds) and is recorded automatically.
5. Type: `Why did it fail?` (or, if it succeeded, `How can I improve this design?`) and `Fix it.`
6. Open **Mission Control** to watch the flight live, **Replay** to review it, **Engineering Analysis** for the report.

Prefer to do it by hand: **Home → ROCKET**, then adjust stages, engines and propellant in the **Vehicle Designer**, check the mission in the **Mission Planner** and press **Simulation → Run simulation**.

To see a failure on purpose, press **Load the demo project** on the Home screen: it builds the launcher, then an under-fuelled variant that really runs out of delta-v, so that *Why did it fail?* and *Fix it.* have something to work on.

## Configure the AI engineer

The **built-in engineer works offline** with rules, the real tool API and the real physics engine. To also use an online language model: **Settings → AI engineer**, tick *Use an online model*, choose the service type (*Anthropic Messages API* or *OpenAI-compatible*, which also covers local servers such as Ollama or LM Studio at `http://localhost:…`), enter the address and model name, paste the API key and press *Save & test connection*.

* The key is stored encrypted by Windows (DPAPI, through Electron `safeStorage`) outside the projects folder. It is never written into project files, logs or the source code.
* The model can only act through the same 20 validated tools; design changes still need your approval; it cannot run programs, read files or change results.

Details: `documentation/AI-ENGINEER.md`.

## Project structure

```
ASTRA-LAB
├─ src/            application code that is not physics or AI
│  ├─ main/          Electron main process (window, disk, secrets, network bridge) + preload
│  ├─ core/          projects, storage, recording/replay, run analysis, reports (PDF/HTML/CSV), experiments, history
│  ├─ vehicles/      vehicle model, builders, analysis (mass, delta-v, checks)
│  ├─ missions/      mission generator, ascent tuner
│  └─ demo.js        the demo conversation
├─ physics/        simulation engine: RK4, gravity, atmosphere, aerodynamics, propulsion, guidance, orbits, power/thermal/comms, rover, failures
├─ ai/             tool API (20 tools), plans/approval, offline engineer, online model provider, session and project memory
├─ ui/             renderer: screens, WebGL renderer, charts, widgets, styles
├─ data/           component catalogue (46 components, all labelled)
├─ vehicles/       example vehicle definitions (JSON)
├─ missions/       example mission definitions (JSON)
├─ simulations/    example recorded simulation (JSON + compressed telemetry)
├─ tests/          automated tests + browser UI smoke test
├─ documentation/  user guide, physics, AI, architecture, data labels, limitations, test results
├─ assets/         icons
├─ scripts/        static server, headless demo, example generator
└─ build/          installer output (electron-builder)
```

## Dependencies

Runtime: **none** (no npm packages are bundled; the physics, AI, 3D renderer, charts and PDF writer are written in plain JavaScript).
Development / packaging: `electron@22.3.27` (last Electron line for Windows 7/8), `electron-builder@24.13.3`.
Optional for the browser test: `playwright`.

## Troubleshooting

* **Black 3D view / graphics driver problems**: everything else keeps working. Set the environment variable `ASTRA_LAB_SOFTWARE_RENDER=1` (or create the file `software-rendering.flag` in `%APPDATA%\ASTRA LAB`) to force software rendering; the app does this automatically after a graphics-process crash.
* **Slow on an old laptop**: *Settings → Performance*: 3D quality *Low* and frame rate *20 fps*. Physics results are identical at every setting.
* **Where are my files?** `Documents\ASTRA-LAB` (menu *File → Open data folder*).
* **Log file**: `Documents\ASTRA-LAB\logs\astra-lab.log`.

## License

MIT. Component data are generic and fictional unless labelled otherwise; no real vendor data are included.
