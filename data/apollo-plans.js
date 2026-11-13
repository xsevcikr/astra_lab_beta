// Stored launch plan of the ready-made Apollo-style Moon rocket (data/templates.js). Written by scripts/update-apollo-plans.mjs; do not edit by hand.
// A plan is the launch epoch and the burn start found by flying the Saturn V ascent in the real simulator and searching the Earth-Moon launch window.
// tests/apollo.test.js re-plans the rocket and fails when these numbers have drifted, then flies the stored plan.
export const APOLLO_PLANS = { default: {
  "parkingAltitude": 185000,
  "aimAltitude": 110000,
  "ascent": {
    "azimuth": 72
  },
  "epoch": 1864917.8,
  "parkEnd": 678.9,
  "burnStart": 9927.9,
  "burnSeconds": 282.3,
  "apogeeAltitude": 620798767,
  "tofSeconds": 236038,
  "impulsiveDv": 3170.3,
  "missKm": 7.8,
  "sunElevationAtLaunch": -41,
  "targetInclination": 1.5,
  "correctionDv": 21.8,
  "parkingPeriKm": 184.6,
  "parkingApoKm": 193.2,
  "model": "Patched conics (Earth, then Moon) for the plan; the flight itself is integrated by the simulator."
} };
