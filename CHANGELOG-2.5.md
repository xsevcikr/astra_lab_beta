# ASTRA LAB 2.5

## Added (what you asked for: 2, 3, 4, 5, 7)

**2. More real flights.** Vega and PSLV-XL join the Validation screen (9 launchers now, with Soyuz-2.1a from 2.4). PSLV-XL passes all 4 rows (burn times within 0.4%, its published 3.8 t reaches a 197 km low point). Vega: stage burn times pass, but the published payload does not reach 700 km (documented miss).

**3. Real launch-day weather.** Planner > Weather: "Load a sounding file". Reads a University of Wyoming "Text: List" sounding or a CSV (`height_m,temp_c,wind_ms,from_deg`). The air (temperature, density, pressure) and the wind then come from the balloon for every flight of the project. Plain error messages for unreadable files. The Wyoming site could not be reached from the build machine, so there is no bundled real sounding; save one on your laptop and load it.

**4. Physics.**
- New Shepard apogee now matches (+3%, was +59%) with a tuned average throttle; its top speed is still 31% high.
- Second slosh mode (Planner > Weather and gravity), about twice the first mode's frequency.
- Two-burn Centaur for Atlas V: tried and not achieved. A fitted two-burn flight did not reach orbit, so the single-burn flight and its caveat stay.
- Nose heating already existed (stagnation-point heat flux and nose temperature). Fin heating and pogo are not added.

**5. Mission-assurance review (PDF).** Analysis > Post-mission report > "Assurance review (PDF)": verdict, requirement margins, how far the model has been checked (table of 9 launchers and the models this run switched on), probability of success with a 95% interval (from the Monte Carlo run), open items, how to reproduce (fingerprints, seed, version), sources. It says when something is missing instead of hiding it.

**7. Graphics.** The clouds now drift slowly over Earth (Home page and flights). No better Mars, outer-planet or Moon maps were reachable from the build machine, so they are unchanged. Stage markings were not added.

## Tests
New `tests/v24.test.js` (sounding reader, atmosphere from a sounding, wind from a sounding, assurance PDF, slosh mode 2, Soyuz, PSLV, Vega, tropical day).

## Not done
- Windows installer, updater and GitHub run: waiting for your repository.
- Atlas V two-burn orbit; Vega's orbit; New Shepard's top speed; pogo; fin heating; stage markings; new planet maps.
