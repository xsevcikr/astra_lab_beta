# Known limitations

Read this before you rely on any number. ASTRA LAB is a simplified engineering laboratory.

## What was and was not verified

* **The Windows installer (.exe) could not be built or run in the environment where this code was written** (no Windows machine and no access to the Electron download there). The packaging configuration (`package.json`, `src/main/*.cjs`, `installer-builder/BUILD-WINDOWS.bat`, the GitHub workflow) follows electron-builder's documented setup, and the main-process security logic is unit-tested against a mock of Electron, but **the first real build on Windows is the first real test of the packaging**. If something fails, the log file `Documents\ASTRA-LAB\logs\astra-lab.log` and the messages of `npm run dist` say why.
* The user interface was tested in headless Chromium (software WebGL) with 25 automated checks (`tests/ui-smoke.mjs`) and by inspecting screenshots, not on a Windows GPU. 3D performance on very old integrated graphics is unmeasured; use *Settings → 3D quality: Low* and 20 fps if it is slow.
* The online AI connection (Anthropic and OpenAI-compatible) was tested against local mock servers that speak the real wire formats, **not against the live services**.
* Electron 22 is chosen so that the app also runs on Windows 7/8. That version no longer receives security updates. The app loads only its own local files, has no Node access in the window, blocks navigation and external requests, and sends network traffic only for the optional AI feature. If you only need Windows 10/11, raise the Electron version in `package.json` (the main process uses the `registerFileProtocol` API, deprecated but available up to Electron 35; migrate to `protocol.handle` when upgrading beyond that).
* The installer is not code-signed (Windows SmartScreen will warn).

## Physics scope

* Bodies: Sun, Earth, Moon, Mars only, with Keplerian (two-body) ephemerides and patched-conic transfers. No other planets, no N-body dynamics, no solar-radiation pressure.
* Monte Carlo covers thrust, Isp, propellant, structural and payload mass. There are no winds, density variations, guidance or sensor errors, so a high success probability here does not mean a high real-world reliability.
* Rigid bodies. No structural flexing, propellant slosh, engine chamber dynamics, combustion instability, wind, weather or turbulence.
* Aerodynamics are engineering-level tables and slender-body formulas, not CFD or wind-tunnel data. Heating is stagnation-point Sutton–Graves with lumped thermal capacity. Structural load is a ratio against per-component strength, not a finite-element analysis.
* **Mars entry-descent-landing is not supported** as a complete sequence (parachute and powered-descent components exist and Moon landings work; the AI flags Mars landers as limited).
* Rover: procedural terrain, simplified traction model. A rover anomaly can produce a recorded failure record while the mission objective is still reported as reached.
* Geostationary transfer orbits and interplanetary trajectories can be simulated by hand-made missions but the AI's automatic design does not target them.

## AI engineer

* The offline engineer designs **two-stage launchers for payloads up to about 1500 kg** to circular orbits (first designs use a 5 % delta-v margin and are flagged as unverified estimates until simulated); heavier payloads often need a manual design. It builds probes, satellites, rovers and Moon landers from templates.
* It understands English only, by rules, not by a language model. Free-form conversation needs the optional online model.
* Automatic ascent tuning tries up to 12 pitch programmes (each a full simulation; a failing launcher can take about 30 s on a slow computer).

## User interface

* You can select a part in the 3D view, drag it along the vehicle and drag length / diameter handles. Free 3D placement is not offered: the vehicle is a stack, so position follows the order of the parts, and parts cannot be dragged into another stage (use the stage list).
* The imperial unit system converts displays and the common design fields (mass, length, force, area, speed, pressure); temperatures in the inspector stay in Kelvin.
* Separated stages and fairings are drawn and propagated as debris (nominal separation velocity, tumbling drag, no winds, no lift). Impact points are estimates, not range-safety clearances. Debris that separated from a rover or lander mission is not tracked.
* Experiments are limited to 120 cases per run.
* The demo project is computed live when you press the button (about 40 s), it is not a stored recording.
* User interface language: English.

## Student-friendly mode and Academy (1.2.0)

* Beginner mode hides information; it does not change any physics. The AI Helper's long answers are folded in Beginner mode (headline and first explanation visible).
* Not done in 1.2.0 (requests from the design brief that are still open): photorealistic planets (clouds, atmosphere shader, craters), free-flying camera with floating origin for multi-scale zoom, follow-camera on separated stages/probes, separated probe/rover as independently simulated and drawn objects with their own trajectory lines, Mars entry-descent-landing, more celestial bodies than Sun/Earth/Moon/Mars, drag-and-drop design comparison boards, a version-history browser with restore/rename UI, command palette and sound, graphics-quality LOD beyond the existing Low/Medium/High setting.
* The offline AI Helper understands teaching questions about the 44 lessons and 29 parts, but free-form requests written by lesson authors under *Challenge ideas* may need rewording (it is rule-based).
* Text size uses CSS zoom; on very small screens use *Normal* text size in Settings.

## Graphics and new screens (1.3.0)

* The Earth, Moon and Mars surfaces are procedural, not photographs or survey data: continents are coarse hand-written outlines, craters and Mars features are approximate. They are visual only and never touch the physics.
* The graphics were checked with software rendering only (about 8 frames per second in the test container, which has no graphics card). Speed on your laptop depends on its GPU; choose *Low* in Settings > 3D quality if it is slow.
* Still not done: free-flying camera with floating origin, the probe/rover as separately simulated objects, Mars landing, bodies beyond Sun/Earth/Moon/Mars, shadows and eclipses, a version-history browser.
* Known bug found but outside the simple builder: the AI tool `ADD_PAYLOAD` fails when a payload already exists (it removes the payload and then its computer twice). The simple builder uses its own safe payload code.

## Added in 1.4.0
- Graphics were checked only with software rendering in a container; frame rate on a real laptop GPU is untested.
- Parachutes are drawn stowed only (no open canopy); no shadows on the ground; planet textures are hand-made, not real maps.
- The "Fix it for me" button cannot repair a rocket that would need more than 33 engines to lift off; it shows where to change it instead.
- The thresholds of the flight report card stars (6 g, strength, heat, 3% spare fuel) are our own teaching choices, not an official standard.
- Windows .bat files and the .exe build are still untested on a real Windows PC.

## Added in 1.5.0
- Validation: the model reproduces most Saturn V and Falcon 9 numbers within the stated bands, but misses some (Saturn V max-Q altitude and speed, Falcon 9 vehicle height, Electron burn timing). The Falcon 9 and Electron pitch tables are fitted to reach the published orbit and labelled so. See documentation/VALIDATION.md.
- Ascent guidance ignores the launch azimuth for non-eastward launches from low-latitude sites, so a sun-synchronous orbit from Cape Canaveral does not work.
- Reusable booster landing and Mars entry-descent-landing are not simulated. The "Mars transfer" challenge is a delta-v budget check only.
- Cost figures in trade studies and the cost challenge are built from illustrative catalog prices, not real prices.
- Czech covers the app shell and main screens only. Lessons, glossary and AI replies are English.
- Teacher mode works with files only. Result hashes are not cheat-proof.
- At very small windows the text zoom is capped so the layout fits (about 1000 x 620 CSS px minimum).

## Added in 1.6.1
- "Fix it and fly again" fixed 14 of 19 failing rockets in our test run; the others end with an honest reason. In a small test, 1 of 13 rockets with all-green lights still failed in a real flight (8 %, before: 25 %). Green is a prediction; only a flight proves it.
- Watch live flies the saved flight path only after you launched or fixed that design once; otherwise it uses the default path.

## Moon rocket (1.8)
* Earth-to-Moon flights use patched conics: the Earth leg is two-body (no Moon gravity until the Moon's sphere of influence, no J2, no Sun), so the planner's launch time is an estimate that two on-board course corrections tidy up. The simulator integrates the real result.
* No return to Earth, no docking or turn-around of the lunar module, no free-return trajectory. The crew cabin is a mass only (no crew, air, life support). The landing site is wherever the lunar orbit leads.
* The launch date is chosen by the planner (stored in `data/moon-plans.js`); re-run `scripts/update-moon-plans.mjs` after changing the rocket or the physics. A flight takes about 5 simulated days and needs high time warp.

## Apollo 11 Moon rocket (1.9)
* The transposition/docking after TLI and the final docking in lunar orbit are scripted sequences that the 3D view plays back; physics keeps one rigid vehicle during them. The CSM is a passive companion while the LM flies. The replay screen does not play these sequences.
* Planning uses patched conics. The crew is mass only. Apollo-class masses, thrusts and the water-sublimator thermal model (lumped) are Estimated, not Real.
* Splashdown is simulated since 2.3 (service module drop, lifting entry, drogue and main parachutes, splashdown at 3 to 12 m/s). The bank law has no sideways targeting, so the landing point is not steered; the heat shield is one lump (no ablation). The trip home takes about 52 h with a 1146 m/s TEI (Apollo: about 59 h).
* The launch time comes from the planner and is at about dawn (sun -6 deg at the pad), not Apollo's date. The adapter is drawn see-through. Verified in headless Chromium, not in a real Electron window.

## Added in 2.0
- Real-mission checks: Curiosity touches down 43 s (10%) earlier than the real landing because the model has no divert manoeuvre and no sky-crane phase. Apollo 11 TEI is planned for the published 59.9 h trip, so it reproduces the burn size; the coast itself uses patched conics.
- Electron burn times remain outside their band (see VALIDATION.md). Saturn V Max-Q now matches (2.4).
- The Earth and Moon photo maps are 2048 x 1024 pixels, so close to the ground the generated detail takes over. `localStorage.setItem('astra.photoTex','0')` switches back to the fully generated planets. Mars and the other bodies are still generated.
- Share links rely on the `astralab://` protocol, which the installer (and the app on its first start) registers with Windows. When the app runs from source or the link is not clickable, paste the link or code into the Share dialog instead. Opening links was tested with simulated links, not on a real Windows desktop.
- The CI workflow needs the project in a GitHub repository; it was written and checked locally, not yet run on GitHub.
- Test bench verdicts use the same simulator as Launch, so they share all its simplifications.

## Added in 2.1
- The wind is one simple profile (20 % of the stated speed at the ground, the full speed at 12 km, none above 26 km) with two sine gusts. It is not a measured wind profile and has no turbulence model. There is no season- or site-dependent atmosphere: the air density is one scale factor.
- Precise gravity includes J2 only (no higher terms) and applies to the Earth and Mars. The Moon has no J2 in the model.
- Monte Carlo draws are independent; correlations between inputs are not modelled. A study of 500 flights can take 15 to 30 minutes.
- The fingerprints identify the inputs; they are not a security feature, and they change whenever any number of the vehicle, mission, weather or settings changes (including the random ids of a newly built design).
- Not added: engines with a thrust-versus-time curve, propellant slosh, structural flex, SPICE or CCSDS file import. These are the next steps toward agency-level use.


## Added in 2.3
* Slosh and flex are optional reduced-order models (first slosh mode per tank, one bending mode). They are off by default. No second slosh mode, no pogo, no higher bending modes.
* Saturn V validation: since the follow-up to 2.3 the S-IC centre engine is shut down at 135 s and a fitted pitch table (0 to 165 s) plus closed-loop steering reproduce Max-Q time and speed and the S-IC cutoff. The Max-Q altitude was 16% low until 2.4: the cause was the standard atmosphere, and a warm Florida day (tropical atmosphere) fixes it. The launch day's real sounding is not used.
* Atlas V 551, Ariane 5 ECA and New Shepard were added to Validation. They have few published trajectory numbers, so most rows check the build and the burn times. Atlas V: the core burn matches since 2.4 (the RD-180 throttles back, a tuned value) but the single-burn orbit overshoots its high point (about 182 x 427 km); the real Centaur burns twice. Ariane 5: GTO payload flown to a 200 km orbit only. New Shepard: Isp, propellant and dry mass are not published and were assumed; apogee is 59% too high. All of this is listed in VALIDATION.md.
* Correlated Monte Carlo uses Gaussian links between inputs; contradicting links are refused.
* CCSDS OEM/OPM and SPICE-text exchange use a simplified EME2000 frame; it is not a binary SPK kernel.
* Auto-update: tested with the real `electron-updater` against a local mock server on Linux (check, download, sha512 check, tampered file refused) and through the app's own IPC wrapper. NOT tested: the Windows installer, the restart-and-install step, a real internet server. The installer is not code-signed. See UPDATES.md.
* Windows: the unpacked Windows app builds with electron-builder on Linux and Electron 22 starts the app (smoke test under a virtual display). The NSIS installer step needs Windows (or wine) and was not run; the two GitHub workflows were syntax-checked but never run on GitHub (this project is not in a repository).
* The Earth on the first page is visual only and falls back to a painted Earth without WebGL.

## Added in 2.4
* Warm tropical day (AFGL tropical atmosphere, a Planner switch): it is a typical Florida summer, not the real sounding of any launch. It moved the Saturn V Max-Q altitude from 11 km to 13 km. Earth only.
* Wind turning with height and one shear layer are simple shapes (a fixed turn reached at 12 km, one Gaussian layer), not measured profiles.
* Soyuz-2.1a was added to Validation (liquid strap-ons modelled at constant average thrust; the page's third-stage numbers disagree with its own burn time by 9%).
* Real satellite clouds are a fixed map; they do not move or match any date.

## Added in 2.5
* Real weather: a balloon sounding replaces the standard atmosphere (temperature) and the simple wind. Pressure comes from the temperature profile by hydrostatic balance, so the ground pressure is the first level's when given. Above the file's top (30 km at most) the standard atmosphere is blended in. Turbulence is a simple gust on top of the measured wind; a sounding is one profile at one time and place, not the wind the rocket actually meets.
* Second slosh mode: classic cylindrical-tank formulas, but no coupling between tanks and no ring baffles other than the damping value.
* Mission-assurance review: the table of validated launchers is the state when the version was built (re-run `node scripts/update-validation-summary.mjs` after physics changes).
* Vega does not reach its published orbit in the model; PSLV-XL and Atlas V reach their low point but not a circular orbit (single burn). New Shepard's top speed is 31% high and its throttle value is tuned. Electron has 4 of 8 rows within band.
* Planet maps: Mars, the outer planets and the Moon are unchanged (no source of better maps could be reached from the build machine); only Earth got sharper maps and real clouds (2.4), which now drift.
* Nose heating is the existing stagnation-point model; fin leading edges and pogo are not modelled.

## Added in 2.6
- Livery is bands and patterns only; no lettering or logos.
- Aurora is a static shader effect, visible on night-side Earth near the poles only.
- Daylight look is generated from the dark rules (`scripts/gen-daylight.py`); 3D views stay dark. Run the script again after changing dark panel colours in `ui/styles.css`.
- Engine rumble and countdown sounds are synthesised, not recorded.
