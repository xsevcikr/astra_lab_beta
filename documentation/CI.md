# Continuous integration

`.github/workflows/tests.yml` runs on every push and every pull request.

| Job | What it does | Typical time |
|---|---|---|
| Static checks | every .js/.mjs/.cjs parses, JSON files are valid, no `.only` focused test, every `tests/*.test.js` and every browser suite `tests/ui-*.mjs` is wired into its runner, `package.json` version = version shown in the app | < 1 min |
| Unit and physics tests | `npm test` on Ubuntu (Node 18 and 22) and Windows (Node 18). The Ubuntu Node 22 leg also writes a JUnit report and line coverage and puts a summary (failures, slowest tests, coverage per folder) on the run page | 6-10 min |
| Physics regression | flies the validation rockets, the mission cases (orbits, J2 drift, Curiosity EDL, Apollo 11) and the workbench scenarios and compares 123 simulated values with `tests/regression/baseline.json` (relative tolerance 1e-4) | 2 min |
| Browser UI suites | all `tests/ui-*.mjs` in headless Chromium | 30-45 min |
| Electron app starts | the real app on Windows Server 2022 and 2025 (unchanged) | 5 min |

The three static/unit/regression jobs wait for the static checks, so a syntax error fails within a minute.

## When the regression check fails

It means a simulated number moved. If that was not intended, it is a bug. If it was intended (a physics fix), re-approve:

    node scripts/regression-check.mjs --update

and commit `tests/regression/baseline.json` in the same pull request, saying why the numbers moved. `--quick` skips Apollo 11 and the
one-day J2 flights when iterating locally.

## Recommended repository setting

In GitHub > Settings > Branches, protect `main` and require the status checks *Static checks*, *Unit and physics tests*,
*Physics regression* and *Browser UI suites*. Then a red change cannot be merged.
