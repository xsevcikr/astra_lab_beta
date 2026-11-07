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
    "epoch": 142968.2,
    "parkEnd": 487,
    "burnStart": 6148.6,
    "burnSeconds": 159.3,
    "apogeeAltitude": 393253661,
    "tofSeconds": 455504,
    "impulsiveDv": 3139.5,
    "missKm": 1.9,
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
    "epoch": 143616.8,
    "parkEnd": 468.3,
    "burnStart": 6149.7,
    "burnSeconds": 171.1,
    "apogeeAltitude": 393231978,
    "tofSeconds": 487418,
    "impulsiveDv": 3137.9,
    "missKm": 5.2,
    "parkingPeriKm": 183.4,
    "parkingApoKm": 220.2,
    "model": "Patched conics (Earth, then Moon) for the plan; the flight itself is integrated by the simulator."
  }
};
