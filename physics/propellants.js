// Propellant properties. Densities are nominal storage densities (kg/m^3). tankage = typical tank dry-mass fraction of propellant mass.
export const PROPELLANTS = {
  'LOX':   { role: 'oxidizer', density: 1141, tankage: 0.030, label: 'Liquid oxygen' },
  'RP-1':  { role: 'fuel',     density: 810,  tankage: 0.050, label: 'RP-1 kerosene' },
  'LH2':   { role: 'fuel',     density: 70.85, tankage: 0.120, label: 'Liquid hydrogen' },
  'CH4':   { role: 'fuel',     density: 422.6, tankage: 0.060, label: 'Liquid methane' },
  'NTO':   { role: 'oxidizer', density: 1443, tankage: 0.040, label: 'Nitrogen tetroxide' },
  'MMH':   { role: 'fuel',     density: 878,  tankage: 0.050, label: 'Monomethylhydrazine' },
  'N2H4':  { role: 'mono',     density: 1004, tankage: 0.060, label: 'Hydrazine (monopropellant)' },
  'GN2':   { role: 'mono',     density: 250,  tankage: 1.000, label: 'Nitrogen gas (cold-gas thruster, high-pressure bottle)' },
  'XENON': { role: 'mono',     density: 1600, tankage: 0.250, label: 'Xenon (electric propulsion)' },
  'SOLID': { role: 'solid',    density: 1800, tankage: 0.0,   label: 'Solid propellant grain' },
};
export const propRole = (name) => PROPELLANTS[name]?.role ?? 'mono';
