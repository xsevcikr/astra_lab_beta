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
    "epoch": 143289.8,
    "parkEnd": 487,
    "burnStart": 6153,
    "burnSeconds": 159.3,
    "apogeeAltitude": 394887999,
    "tofSeconds": 457786,
    "impulsiveDv": 3139.8,
    "missKm": 14.5,
    "parkingPeriKm": 183.3,
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
    "epoch": 928576.8,
    "parkEnd": 468.3,
    "burnStart": 1955.6,
    "burnSeconds": 171.1,
    "apogeeAltitude": 360178955,
    "tofSeconds": 433743,
    "impulsiveDv": 3122.3,
    "missKm": 2.7,
    "parkingPeriKm": 183.4,
    "parkingApoKm": 220.2,
    "model": "Patched conics (Earth, then Moon) for the plan; the flight itself is integrated by the simulator."
  }
};
