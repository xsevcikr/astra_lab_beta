# ASTRA LAB 2.3

- **Missions run to the end.** Apollo now drops the service module, comes in on a lifting entry, opens drogue and main parachutes and splashes down (about 880 s from the entry interface, peak about 6.2 g). New template "Apollo: coming home" flies just the last 16 minutes.
- **First page.** A slowly turning 3D Earth, big portals (Learn, Build, Launch, Plan, Test, Real missions, Ask AI). Everything else is under "More". The Earth is only on this page.
- **Explore Beyond look** on every screen: night sky, floating astronaut and rocks, glass panels.
- **Physics.** Thrust curves (Designer "Thrust shape"), propellant slosh and one bending mode (Planner switches, off by default), capsule lift and splashdown landing.
- **Monte Carlo links.** Link inputs with a correlation; the run uses them.
- **CCSDS / SPICE.** Export OEM or SPICE text, compare with a reference ephemeris, start a flight from a CCSDS OPM file.
- **Updates.** Settings > Updates (off until you type an https or github: address). See documentation/UPDATES.md.
- **Validation follow-ups.** Saturn V now shuts its centre engine early and flies a fitted pitch table plus closed-loop steering: 15 of 16 rows pass (Max-Q altitude is still 16% low). Three new vehicles: Atlas V 551, Ariane 5 ECA, New Shepard (with strap-on booster separation). Misses are listed in documentation/VALIDATION.md.
- **Updates tested for real** against a local mock server (`scripts/updater-live-check.cjs`); this found that the Windows build had no update settings, now fixed (`build.publish`, `--publish never`).
- **Packaging checks on Linux:** unpacked Windows app builds, Electron 22 starts the app, workflows syntax-checked, unit suite run on Node 18 and 22. The NSIS installer and the GitHub run itself are still untested.
