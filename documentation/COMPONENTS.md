# Parts catalogue

`data/components.js` holds 316 ready-made parts in 30 kinds (110 added in the latest round). Every part has a `description`, a `plain` pair (`best_for`, `trade_off`: one short line each, shown on the cards of the Add-a-part picker) and real numbers (mass, size, thrust, Isp, power, ...). Names and numbers are *fictional but physically plausible* ("class" values), not real products; each part carries `dataSource`.

| Group | Kinds | Examples |
|---|---|---|
| Propulsion | engine (61), fuel / oxidizer / propellant tanks, RCS | kerolox, methalox and hydrolox engines, aerospike-style, vernier, cold-gas, hydrazine, Hall and ion thrusters, solid motors and boosters |
| Structure | nose cone, fairing, interstage, **decoupler**, structural section, fins, heat shield | ogive, conical and blunt noses, three fairing sizes, adapters, open truss, grid fins, ablative and tile shields |
| Avionics | avionics, guidance, computer, reaction wheels | mini flight computer ... dual-redundant computer, nano to extra-large wheels |
| Power | battery, solar panel | 10 Wh ... 20 kWh, fixed, rigid and roll-out arrays |
| Communications | antenna | low-gain cone, UHF relay, X-band dish, phased array, Ka-band gimballed dish |
| Instruments | instrument, payload, sensor | drill, sampling arm, imagers, radar, spectrometers, star trackers, lidar, CubeSats |
| Thermal | radiator, heater, insulation | 2 W ... 500 W heaters, deployable radiator, cryogenic and aerogel blankets |
| Landing | landing legs, parachute | tiny to extra-large legs, airbags, drogue, supersonic and cluster chutes |
| Rover | chassis, wheels, motor | micro, small, standard, medium and extra-large |

## Adding a part

1. Add the object to the right array in `data/components.js` (`NEW_*` for new ones). Give it a unique `catalogId`, `kind`, `name`, `description` and numbers. `plain` is optional: if it is missing, `autoPlain()` writes a line from the part's real numbers.
2. A new **kind** also needs: `KIND_LABELS`, `KIND_FIELDS` (inspector fields), a `CATEGORIES` entry, a full entry in `data/academy/components-info.js`, an icon in `ui/lib/editorkit.js` and a model in `ui/lib/scene.js` (`componentGeometry`).
3. `node --test tests/components-catalog.test.js` checks ids, descriptions, plain lines, sane numbers (sea-level Isp not above vacuum Isp, engine thrust-to-weight below 400, tank mass below 3x its propellant ...) and the Academy entries.
