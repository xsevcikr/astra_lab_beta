// Stored launch plans of the ready-made Moon rockets (data/templates.js). Written by scripts/update-moon-plans.mjs; do not edit by hand.
// A plan is the launch epoch and the burn start found by flying the ascent in the real simulator and searching the Earth-Moon launch window.
// tests/moonrocket.test.js re-plans both rockets and fails when these numbers have drifted, then flies the stored plan to a landing.
export const MOON_PLANS = {
  "moon-rocket-rover": {
    "schedule": {
      "hF": 100000,
      "n": 0.5
    },
    "parkingAltitude": 185000,
    "aimAltitude": 110000,
    "epoch": 734484.4,
    "parkEnd": 487,
    "burnStart": 1310.2,
    "burnSeconds": 159.3,
    "apogeeAltitude": 371585295,
    "tofSeconds": 429758,
    "impulsiveDv": 3130.4,
    "missKm": 407.3,
    "parkingPeriKm": 183.4,
    "parkingApoKm": 236.5,
    "model": "Patched conics (Earth, then Moon) for the plan; the flight itself is integrated by the simulator."
  },
  "moon-rocket-module": {
    "schedule": {
      "hF": 100000,
      "n": 0.5
    },
    "parkingAltitude": 185000,
    "aimAltitude": 110000,
    "epoch": 735720.1,
    "parkEnd": 468.3,
    "burnStart": 1283.9,
    "burnSeconds": 171.1,
    "apogeeAltitude": 371526241,
    "tofSeconds": 459329,
    "impulsiveDv": 3129.7,
    "missKm": 31,
    "parkingPeriKm": 183.4,
    "parkingApoKm": 220.1,
    "model": "Patched conics (Earth, then Moon) for the plan; the flight itself is integrated by the simulator."
  }
};
