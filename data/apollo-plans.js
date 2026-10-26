// Stored launch plan of the ready-made Apollo-style Moon rocket (data/templates.js). Written by scripts/update-apollo-plans.mjs; do not edit by hand.
// A plan is the launch epoch and the burn start found by flying the Saturn V ascent in the real simulator and searching the Earth-Moon launch window.
// tests/apollo.test.js re-plans the rocket and fails when these numbers have drifted, then flies the stored plan.
export const APOLLO_PLANS = { default: {
  "parkingAltitude": 185000,
  "aimAltitude": 110000,
  "ascent": {
    "azimuth": 72
  },
  "epoch": 495527.3,
  "parkEnd": 678.9,
  "burnStart": 9967.2,
  "burnSeconds": 282.3,
  "apogeeAltitude": 569094906,
  "tofSeconds": 261451,
  "impulsiveDv": 3165.1,
  "missKm": 10.9,
  "sunElevationAtLaunch": -6,
  "targetInclination": 178.5,
  "correctionDv": 12.8,
  "parkingPeriKm": 184.6,
  "parkingApoKm": 193.2,
  "model": "Patched conics (Earth, then Moon) for the plan; the flight itself is integrated by the simulator."
} };
