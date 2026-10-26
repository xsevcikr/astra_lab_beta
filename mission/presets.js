// Educational Apollo-inspired architecture. Values are rounded public figures from NASA mission documents (dataSource: 'estimated');
// nothing here is NASA software or a claim of reproducing NASA's internal models. The user can edit every number or build their own.
export const APOLLO_STYLE = {
  name: 'Apollo-style lunar landing (educational)',
  dataSource: 'estimated',
  crew: 3, crewMass: 100,
  launcher: {
    stages: [
      { name: 'Booster stage (5 kerolox engines)', role: 'booster', dry: 137000, prop: 2169000, thrustVac: 38.7e6, thrustSl: 35.1e6, endThrustFrac: 0.8, ispVac: 304, ispSl: 263 },
      { name: 'Upper stage (5 hydrolox engines)', role: 'upper', dry: 36000, prop: 451000, thrustVac: 5.1e6, ispVac: 421 },
      { name: 'Translunar stage (1 hydrolox, restartable)', role: 'tli', dry: 13500, prop: 109000, thrustVac: 0.89e6, ispVac: 421, restarts: 2 },
    ],
  },
  adapter: { mass: 4000 }, // spacecraft adapter, guidance unit, escape tower share
  cm: {
    mass: 5560, seats: 3, area: 12.0, cd: 1.28, ld: 0.3, noseRadius: 4.7,
    heatShield: { areaDensity: 40, effectiveHeat: 1.2e7, maxHeatFlux: 4.0e6 },
    parachutes: { drogues: 2, mains: 3, mainArea: 500, mainCd: 0.9, drogueDeployAlt: 7300, maxDrogueQ: 8000 },
    maxG: 10, rcsDv: 60, crewDaysSupport: 45,
  },
  sm: { dry: 6100, prop: 18400, thrust: 91.2e3, isp: 314 },
  lm: {
    seats: 2, crewLanding: 2,
    descent: { dry: 2000, prop: 8200, thrust: 45.0e3, isp: 311, throttleMin: 0.10 },
    ascent: { dry: 2150, prop: 2350, thrust: 15.6e3, isp: 311 },
    cargo: 0, science: 100, samples: 45, rover: 0, surfaceHoursCapacity: 75,
  },
  mission: { parkAlt: 185e3, lunarAlt: 111e3, landingSite: 'mare-tranquil', surfaceDays: 2, entryAngleDeg: 6.5, launchLatDeg: 28.5, days: 8 },
};

export const cloneArch = (a) => JSON.parse(JSON.stringify(a));
