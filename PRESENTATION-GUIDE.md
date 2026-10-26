# Presenting ASTRA LAB 2.1: a 10-minute demo

Everything below works offline. Do the "Before you start" steps once, ten minutes before the talk. Use **Expert** mode (top bar) so every screen name matches this page; switch to **Beginner** to show how simple it can be.

## Before you start
1. Start ASTRA LAB and open **Settings**. Set graphics quality to **High** if the computer has a graphics card. Close other programs.
2. Open **Test bench** (Beginner name: *Will it work?*) and press **Test all shown** once. It takes about two minutes, and the verdicts stay on screen while the app runs.
3. Open **Validation** (*Does it match real rockets?*) and press the check buttons for **Orbits**, **Curiosity** and **Orbit drift (J2)**. Press **Apollo 11** last; it takes about a minute.

## The demo
1. **Will it work? (1.5 min).** Show the cards. "Every card really flies in the physics simulator, then says PASS or FAIL and why." Point at the three broken ones ("Overloaded launcher", "Half-fuelled launcher", "Lander low on fuel") and read one reason aloud.
2. **A flight (2 min).** On the small launcher card press **Watch it fly**, then in Mission Control press **Start** (20x speed is fine). Pick the **Director** camera and press **F** for Cinema. It chooses shots by flight phase like a launch broadcast. Press **Esc** to leave.
3. **Is it right? (2 min).** Open **Validation**. Show Apollo 11 (7 of 7 numbers within 10% of the NASA Mission Report), Falcon 9 (8 of 8), and *Orbit drift (J2)*: a satellite in a Sun-synchronous orbit has its orbit plane turn at 0.985 degrees a day, the value the definition requires. Say it plainly: "One row is a miss. Curiosity touches down 43 seconds early, because the model has no sky crane. We show it instead of hiding it."
4. **Weather and risk (2.5 min).** In **Mission Planner** > Environment turn on wind (15 m/s, from 270) and fly again. Then **Experiment Lab** > Reliability study: tick *Wind speed* and *Air density*, set **50** flights, press **Run Monte Carlo**. The result is the probability of success with a 95% interval, histograms and which input matters most. Say: "Real missions are signed off this way, not with one perfect flight."
5. **Trust and sharing (2 min).** **Replay** > *Re-run and verify*: the flight is flown again from its recorded inputs and every sample must be identical. Show the input fingerprint. In **Engineering Analysis** show *Mission report (PDF)*, *Python script* and *MATLAB script*. Finally press **Share** in the builder: a link, a code, or a file that a colleague opens with one click.

## If someone asks
- **"Is it NASA-grade?"** It is a validated educational and design-study tool, not a flight-certification tool. It reproduces published Apollo, Falcon 9, orbit and Curiosity numbers within stated bands, and the page lists what does not match (VALIDATION.md, *Honest disagreements*).
- **"What is not modelled?"** See `documentation/KNOWN-LIMITATIONS.md`: no structural flex or propellant slosh, simple jet-stream wind, spherical gravity unless precise gravity is on, Earth and Moon photo maps only.
- **"Can I repeat a result?"** Yes: same inputs, same seed, same numbers. The fingerprint in the report proves which inputs were used.
- **"Can I use my own tools?"** Telemetry as CSV or JSON, a Python script and a MATLAB/Octave script that load and plot it.

## If something goes wrong on stage
- A flight looks stuck: press **Stop** then **Restart**.
- Graphics are slow: Settings > quality **Medium**, or press **F** (Cinema) to draw less.
- Start fresh: **Projects** > New project. Nothing you do in the Test bench changes your project.
