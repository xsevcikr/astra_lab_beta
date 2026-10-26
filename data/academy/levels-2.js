// ASTRA LAB Aerospace Academy - levels L4, L5, L6
// Pure data + small pure functions. No imports, no DOM.

const G0 = 9.80665;
const R_EARTH = 6371000;
const MU_EARTH = 3.986e14;

function isaAir(hKm) {
  // International Standard Atmosphere, valid 0-20 km
  const h = Math.max(0, Math.min(20, hKm));
  let T, p;
  if (h <= 11) {
    T = 288.15 - 6.5 * h;
    p = 101325 * Math.pow(T / 288.15, 5.2559);
  } else {
    T = 216.65;
    p = 22632 * Math.exp(-(h - 11) / 6.3416);
  }
  const rho = p / (287.05 * T);
  return { T, p, rho };
}

export default [
  {
    id: 'L4',
    n: 4,
    title: 'Propulsion',
    icon: 'flame',
    blurb: 'Learn how rocket engines turn propellant into thrust, and how to choose the right engine for the job.',
    lessons: [
      {
        id: 'L4-1',
        title: 'Chemical rocket engines, propellants and Isp',
        minutes: 4,
        tagline: 'Engines burn fuel with oxidizer and throw the gas out. Isp rates them.',
        definition: 'Propellant is fuel plus oxidizer (a chemical that lets fuel burn without air); Isp rates how well an engine uses it.',
        why: 'A few percent more Isp can mean a much bigger payload or a much smaller rocket.',
        explain: [
          'A rocket engine is like a violent campfire in a strong metal cup. Fuel and oxidizer burn in a chamber, and the hot gas rushes out the nozzle.',
          'Thrust equals the mass of gas thrown each second times its speed (exhaust velocity, ve). Rockets carry their own oxidizer, often liquid oxygen (LOX), so they work in vacuum.',
          'Isp is just ve ÷ 9.81. Typical: solids 240 to 280 s, kerosene 300 to 350 s, hydrogen 420 to 465 s. Hydrogen is very light, so tanks are huge.'
        ],
        keyIdeas: [
          'Thrust = mass flow × exhaust velocity.',
          'Isp = exhaust velocity ÷ 9.81.',
          'Hydrogen and LOX has the best Isp but bulky tanks.',
          'Rockets carry their own oxidizer.'
        ],
        equations: [
          {
            name: 'Specific impulse',
            formula: 'Isp = F ÷ (ṁ × g₀)',
            vars: [
              ['Isp', 'specific impulse', 's'],
              ['F', 'thrust', 'N'],
              ['ṁ', 'propellant mass flow rate', 'kg/s'],
              ['g₀', 'standard gravity (9.81)', 'm/s²']
            ],
            meaning: 'The more thrust you get from each kilogram per second of propellant, the higher the Isp.'
          },
          {
            name: 'Thrust from exhaust',
            formula: 'F = ṁ × ve = ṁ × Isp × g₀',
            vars: [
              ['F', 'thrust', 'N'],
              ['ṁ', 'propellant mass flow rate', 'kg/s'],
              ['ve', 'effective exhaust velocity', 'm/s']
            ],
            meaning: 'Throw more gas per second, or throw it faster, and the push gets bigger.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Kerosene and LOX: Isp 300 s, burning 100 kg/s.\nve = 300 × 9.81 = about 2,942 m/s.\nF = 100 × 2,942 = about 294 kN.\nHydrogen and LOX, Isp 450 s: ve = about 4,413 m/s.\nThat is 1.5 times faster exhaust.\nSame thrust would need only two thirds of the propellant.'
        },
        diagram: 'rocket-anatomy',
        mistakes: [
          'Isp is not burn time. It is an efficiency number. Burn time depends on propellant carried.',
          'Higher Isp is not always better. Hydrogen needs huge tanks; kerosene is compact for first stages.'
        ],
        recap: 'Thrust is mass flow times exhaust velocity. Higher Isp means faster exhaust and better use of propellant.',
        lab: {
          title: 'Try it: engine calculator',
          intro: 'Pick Isp and propellant flow to see thrust and burn time.',
          inputs: [
            { id: 'isp', label: 'Specific impulse', unit: 's', min: 200, max: 470, step: 5, value: 300 },
            { id: 'mdot', label: 'Propellant flow', unit: 'kg/s', min: 1, max: 2000, step: 1, value: 100 },
            { id: 'prop', label: 'Propellant carried', unit: 'kg', min: 100, max: 500000, step: 100, value: 20000 }
          ],
          compute: (v) => {
            const ve = v.isp * G0;
            const mdot = Math.max(v.mdot, 1e-6);
            return [
              { label: 'Exhaust velocity', value: ve, unit: 'm/s', digits: 0 },
              { label: 'Thrust', value: (mdot * ve) / 1000, unit: 'kN', digits: 1 },
              { label: 'Burn time', value: v.prop / mdot, unit: 's', digits: 0 }
            ];
          },
          note: 'Higher flow gives more thrust, but the propellant runs out sooner.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build me a single-stage rocket with a kerosene and liquid oxygen engine and tell me its exhaust velocity and specific impulse.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'What does a higher Isp tell you about an engine?',
            options: [
              'It burns for longer',
              'More thrust per kg of propellant each second',
              'It is always bigger and heavier',
              'It works only in air'
            ],
            answer: 1,
            why: 'Isp is an efficiency number, not a burn time.'
          },
          {
            q: 'Which common pair gives the highest Isp?',
            options: [
              'Solid rubber fuel',
              'Kerosene and liquid oxygen',
              'Liquid hydrogen and liquid oxygen',
              'Compressed air and water'
            ],
            answer: 2,
            why: 'Hydrogen and oxygen give 420 to 465 s; the exhaust is light and very fast.'
          },
          {
            q: 'An engine has Isp 350 s. About what is its exhaust velocity?',
            options: ['About 3,430 m/s', 'About 350 m/s', 'About 34,300 m/s', 'About 1,715 m/s'],
            answer: 0,
            why: 've = 350 × 9.81 = about 3,430 m/s.'
          }
        ],
        quick: [
          'Fuel and oxidizer burn, and hot gas shoots out.',
          'Higher Isp means more push per kilogram of propellant.',
          'Hydrogen gives top Isp but needs huge tanks.'
        ],
        eli15: 'In plain words: Isp is like miles per gallon, but for rocket fuel.'
      },
      {
        id: 'L4-2',
        title: 'Nozzles and expansion',
        minutes: 4,
        tagline: 'The nozzle turns hot gas into a fast jet. Its shape fits the air.',
        definition: 'A de Laval nozzle is a narrow throat followed by a widening bell. Expansion ratio is exit area divided by throat area.',
        why: 'A good nozzle adds many seconds of Isp. A wrong one wastes thrust.',
        explain: [
          'Chamber gas is at about 10 MPa (100 times normal air pressure). The nozzle turns that pressure and heat into speed. Squeeze a hose, and the water flies out faster.',
          'Gas hits exactly the speed of sound (Mach 1) at the narrow throat. In the widening bell it keeps expanding and goes supersonic. A bigger expansion ratio gives more Isp, so upper stages have huge bells.',
          'Thrust also has a pressure term: (pe − pa) × Ae. In vacuum pa is zero, so you gain thrust. Sea-level bells are short (ratio 15 to 40); vacuum bells are long (80 to 200 or more).'
        ],
        keyIdeas: [
          'Throat gives Mach 1; bell gives supersonic.',
          'Bigger expansion ratio means higher vacuum Isp.',
          'Vacuum thrust is often 8 to 15% higher.',
          'Sea-level bells are small; vacuum bells large.'
        ],
        equations: [
          {
            name: 'Thrust with pressure term',
            formula: 'F = ṁ × ve + (pe − pa) × Ae',
            vars: [
              ['F', 'thrust', 'N'],
              ['ṁ', 'mass flow', 'kg/s'],
              ['ve', 'exhaust velocity', 'm/s'],
              ['pe', 'pressure at nozzle exit', 'Pa'],
              ['pa', 'outside air pressure', 'Pa'],
              ['Ae', 'nozzle exit area', 'm²']
            ],
            meaning: 'Thrust is the momentum of the exhaust plus a bonus (or penalty) from the pressure difference across the exit.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Flow 250 kg/s, ve 3,000 m/s, exit area 1.0 m².\nExit pressure pe = 60 kPa.\nMomentum thrust: 250 × 3,000 = 750,000 N.\nSea level: (60,000 − 101,300) × 1.0 = −41,300 N.\nTotal at sea level = about 708,700 N.\nVacuum: pressure term = +60,000 N.\nTotal in vacuum = 810,000 N, about 14% more.'
        },
        diagram: null,
        mistakes: [
          'A bigger bell is not always better. At sea level it can be overexpanded and unstable.',
          'Thrust is not fixed. It changes with altitude, because outside pressure changes.'
        ],
        recap: 'A nozzle takes gas to Mach 1 at the throat, then faster in the bell. Shape must fit the air.',
        lab: {
          title: 'Try it: sea level vs. space',
          intro: 'Change the outside pressure and see how the same engine behaves.',
          inputs: [
            { id: 'mdot', label: 'Mass flow', unit: 'kg/s', min: 10, max: 1000, step: 5, value: 250 },
            { id: 've', label: 'Exhaust velocity', unit: 'm/s', min: 1500, max: 4500, step: 50, value: 3000 },
            { id: 'pe', label: 'Exit pressure', unit: 'kPa', min: 1, max: 150, step: 1, value: 60 },
            { id: 'ae', label: 'Exit area', unit: 'm²', min: 0.1, max: 5, step: 0.1, value: 1 },
            { id: 'pa', label: 'Outside pressure', unit: 'kPa', min: 0, max: 101.3, step: 0.5, value: 101.3 }
          ],
          compute: (v) => {
            const mom = v.mdot * v.ve;
            const f = mom + (v.pe - v.pa) * 1000 * v.ae;
            const fvac = mom + v.pe * 1000 * v.ae;
            const mdot = Math.max(v.mdot, 1e-6);
            return [
              { label: 'Thrust at this pressure', value: f / 1000, unit: 'kN', digits: 1 },
              { label: 'Thrust in vacuum', value: fvac / 1000, unit: 'kN', digits: 1 },
              { label: 'Isp at this pressure', value: f / (mdot * G0), unit: 's', digits: 0 }
            ];
          },
          note: 'Set outside pressure to 0 for vacuum. Set it equal to exit pressure and the pressure term vanishes.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch a two-stage rocket and show how the first-stage engine thrust changes from the launch pad to high altitude.',
          screen: 'analysis'
        },
        quiz: [
          {
            q: 'What happens to gas speed in the widening bell?',
            options: [
              'It slows down',
              'It stays exactly at Mach 1',
              'It becomes supersonic and keeps speeding up',
              'It stops'
            ],
            answer: 2,
            why: 'The flow hits Mach 1 at the throat, then keeps speeding up in the bell.'
          },
          {
            q: 'Why do upper-stage engines have such large bells?',
            options: [
              'To look impressive',
              'Thin air lets a bigger ratio add speed',
              'To make the engine lighter',
              'To cool the tanks'
            ],
            answer: 1,
            why: 'In vacuum the gas can expand fully, which raises Isp.'
          },
          {
            q: 'Compared with sea level, the same engine in vacuum makes...',
            options: ['Less thrust', 'Exactly the same thrust', 'No thrust', 'More thrust'],
            answer: 3,
            why: 'With zero outside pressure, the pressure term grows, so thrust is higher.'
          }
        ],
        quick: [
          'The throat makes the gas reach the speed of sound.',
          'The bell then makes it faster than sound.',
          'Engines make more thrust in vacuum than at sea level.'
        ],
        eli15: 'In plain words: squeeze a garden hose and the water shoots out faster.'
      },
      {
        id: 'L4-3',
        title: 'Solid vs. liquid, pumps and engine cycles',
        minutes: 4,
        tagline: 'Solids are simple and strong. Liquids are controllable but need pumps.',
        definition: 'A solid motor has fuel and oxidizer mixed in one block. A liquid engine keeps them in tanks and pumps them in.',
        why: 'Solid or liquid, and the pump type, decide an engine\'s cost, power and reliability.',
        explain: [
          'A solid motor is a metal case of rubbery propellant with a hollow channel inside. Once lit, it burns like a giant firework and is hard to stop. Isp is about 240 to 280 s.',
          'A liquid engine keeps fuel and oxidizer in separate tanks. It can throttle, stop and restart, with higher Isp. The cost is plumbing, valves and pumps.',
          'A turbopump (pump spun by a gas turbine) lifts pressure right before the engine, so tanks stay light. Cycles power it differently: gas generator (Merlin), expander (RL10), staged combustion (RS-25).'
        ],
        keyIdeas: [
          'Solids: simple, strong, hard to stop, lower Isp.',
          'Liquids: throttle, restart, higher Isp.',
          'Turbopumps keep tanks light.',
          'Cycles are different ways to spin the turbine.'
        ],
        equations: [
          {
            name: 'Pump power',
            formula: 'P = (ṁ ÷ ρ) × Δp ÷ η',
            vars: [
              ['P', 'shaft power needed', 'W'],
              ['ṁ', 'propellant mass flow', 'kg/s'],
              ['ρ', 'propellant density', 'kg/m³'],
              ['Δp', 'pressure increase', 'Pa'],
              ['η', 'pump efficiency (0 to 1)', '']
            ],
            meaning: 'The power to pump a liquid is the volume flow times the pressure rise, divided by how efficient the pump is.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Pump 100 kg/s of kerosene (810 kg/m³), pressure rise 15 MPa, 70% efficient.\nVolume flow = 100 ÷ 810 = about 0.123 m³/s.\nIdeal power = 0.123 × 15,000,000 = about 1.85 MW.\nDivide by efficiency: 1.85 ÷ 0.70 = about 2.6 MW.\nThat is like thousands of household kettles.'
        },
        diagram: 'rocket-anatomy',
        mistakes: [
          'Most solids cannot be switched off. The grain burns until it is gone.',
          'Turbopumps are not electric. Hot gas made from the propellants spins the turbine.'
        ],
        recap: 'Solids are simple and powerful but hard to control. Liquids are efficient and controllable but need turbopumps.',
        lab: {
          title: 'Try it: turbopump power',
          intro: 'Set flow, density and pressure rise to see the pump power needed.',
          inputs: [
            { id: 'mdot', label: 'Propellant flow', unit: 'kg/s', min: 1, max: 1000, step: 1, value: 100 },
            { id: 'rho', label: 'Propellant density', unit: 'kg/m³', min: 70, max: 1500, step: 10, value: 810 },
            { id: 'dp', label: 'Pressure rise', unit: 'MPa', min: 1, max: 60, step: 1, value: 15 },
            { id: 'eta', label: 'Pump efficiency', unit: '%', min: 20, max: 90, step: 1, value: 70 }
          ],
          compute: (v) => {
            const rho = Math.max(v.rho, 1);
            const eta = Math.max(v.eta, 1) / 100;
            const q = v.mdot / rho;
            return [
              { label: 'Volume flow', value: q, unit: 'm³/s', digits: 3 },
              { label: 'Shaft power needed', value: (q * v.dp * 1e6) / eta / 1e6, unit: 'MW', digits: 2 }
            ];
          },
          note: 'Try liquid hydrogen (about 71 kg/m³): the same mass needs a huge volume.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build a small rocket with a solid booster, then build the same rocket with a liquid engine, and compare their performance.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'A main advantage of a liquid engine over a solid motor?',
            options: [
              'It is simpler',
              'It can throttle and restart',
              'It can be stored for years',
              'It has no moving parts'
            ],
            answer: 1,
            why: 'Valves control flow, so it can throttle, stop and relight.'
          },
          {
            q: 'Why do big liquid rockets use turbopumps?',
            options: [
              'To be louder',
              'To heat the propellant',
              'Light low-pressure tanks, high-pressure engine feed',
              'To turn the rocket'
            ],
            answer: 2,
            why: 'Pumping just before the engine avoids thick, heavy tanks.'
          },
          {
            q: 'In staged combustion, where does the turbine exhaust go?',
            options: [
              'Into the main chamber, burned again',
              'Thrown overboard',
              'Used to cool the tanks',
              'Frozen into ice'
            ],
            answer: 0,
            why: 'Nothing is wasted, so staged combustion is efficient.'
          }
        ],
        quick: [
          'Solids are simple, cheap and hard to switch off.',
          'Liquids can throttle and restart, and have higher Isp.',
          'Turbopumps keep tanks light and thin.'
        ],
        eli15: 'In plain words: a solid motor is a big firework; a liquid engine is a tap you can turn.'
      },
      {
        id: 'L4-4',
        title: 'Electric and ion propulsion',
        minutes: 4,
        tagline: 'Ion engines shoot gas very fast but push very gently.',
        definition: 'An ion thruster strips electrons from xenon gas and uses electric fields to shoot the charged atoms out very fast.',
        why: 'With ten times the Isp of chemical rockets, ion engines let probes gain huge speed from little propellant.',
        explain: [
          'An ion engine skips burning: electricity, usually from solar panels, charges xenon atoms (ionizes them). Metal grids at about a thousand volts pull the ions out. They leave at 20 to 40 km/s, ten times faster than chemical exhaust.',
          'The catch: thrust is only 0.05 to 0.1 newtons, like two sheets of paper. It cannot lift off Earth, but in space it can push for months.',
          'Isp is about 2,000 to 5,000 s versus 300 to 450 s for chemical. NASA\'s Dawn probe gained over 10 km/s and visited two asteroids. The price is electric power, so probes carry big solar panels.'
        ],
        keyIdeas: [
          'Electricity pushes charged atoms at 20 to 40 km/s.',
          'Isp in thousands of seconds, thrust tiny.',
          'Cannot launch, but ideal for long trips.',
          'The limit is electric power.'
        ],
        equations: [
          {
            name: 'Electrical power for a thruster',
            formula: 'P = F × ve ÷ (2 × η)',
            vars: [
              ['P', 'electrical power needed', 'W'],
              ['F', 'thrust', 'N'],
              ['ve', 'exhaust velocity', 'm/s'],
              ['η', 'overall efficiency (0 to 1)', '']
            ],
            meaning: 'A faster jet at the same thrust needs more power, and any inefficiency raises the bill.'
          },
          {
            name: 'Propellant use',
            formula: 'ṁ = F ÷ ve',
            vars: [
              ['ṁ', 'propellant mass flow', 'kg/s'],
              ['F', 'thrust', 'N'],
              ['ve', 'exhaust velocity', 'm/s']
            ],
            meaning: 'The faster the exhaust, the less propellant you need for the same push.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Isp 3,000 s, thrust 0.09 N, 65% efficient, 1,000 kg probe.\nve = 3,000 × 9.81 = about 29,420 m/s.\nFlow = 0.09 ÷ 29,420 = about 3 milligrams per second.\nPower = 0.09 × 29,420 ÷ (2 × 0.65) = about 2,040 W.\nAcceleration = 0.09 ÷ 1,000 = 0.00009 m/s².\nOne day adds about 7.8 m/s; one year about 2.8 km/s.'
        },
        diagram: null,
        mistakes: [
          'Tiny thrust is not useless. It runs for months and sips propellant, so speeds get very high.',
          'Ion engines cannot launch from Earth. Their thrust is far below any spacecraft\'s weight.'
        ],
        recap: 'Ion engines fling atoms out at 20 to 40 km/s: huge Isp, tiny thrust. Great in space, never for launch.',
        lab: {
          title: 'Try it: ion engine budget',
          intro: 'Choose Isp, thrust and efficiency to see power and propellant needs.',
          inputs: [
            { id: 'isp', label: 'Specific impulse', unit: 's', min: 1000, max: 10000, step: 100, value: 3000 },
            { id: 'thr', label: 'Thrust', unit: 'mN', min: 1, max: 500, step: 1, value: 90 },
            { id: 'eta', label: 'Efficiency', unit: '%', min: 10, max: 90, step: 1, value: 65 },
            { id: 'mass', label: 'Spacecraft mass', unit: 'kg', min: 50, max: 10000, step: 50, value: 1000 }
          ],
          compute: (v) => {
            const ve = v.isp * G0;
            const F = v.thr / 1000;
            const eta = Math.max(v.eta, 1) / 100;
            const mass = Math.max(v.mass, 1);
            return [
              { label: 'Exhaust velocity', value: ve, unit: 'm/s', digits: 0 },
              { label: 'Electrical power', value: (F * ve) / (2 * eta), unit: 'W', digits: 0 },
              { label: 'Propellant flow', value: (F / ve) * 1e6, unit: 'mg/s', digits: 2 },
              { label: 'Speed gained per day', value: (F / mass) * 86400, unit: 'm/s', digits: 1 }
            ];
          },
          note: 'Doubling Isp at the same thrust doubles power but halves propellant flow.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build me a small space probe with an ion engine and compare how long it takes to change speed against a chemical-engine probe.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'What is the main drawback of an ion engine?',
            options: [
              'It burns too much propellant',
              'Its thrust is very small',
              'It only works in the atmosphere',
              'It needs no power'
            ],
            answer: 1,
            why: 'Ion thrust is tiny, but it can run for a very long time.'
          },
          {
            q: 'Ion Isp is about how many times a kerosene rocket\'s?',
            options: ['The same', 'About 10% higher', 'About 2 times', 'About 10 times'],
            answer: 3,
            why: 'About 2,000 to 5,000 s versus 300 to 350 s: around ten times.'
          },
          {
            q: 'Where does an ion thruster get its energy?',
            options: ['Burning xenon', 'Electricity, often from solar panels', 'A solid fuel block', 'Compressed air'],
            answer: 1,
            why: 'Xenon is not burned. Solar or nuclear electricity accelerates the ions.'
          }
        ],
        quick: [
          'Electricity, not fire, pushes the atoms out.',
          'Super efficient, but the push is tiny.',
          'It works only in space, never for launch.'
        ],
        eli15: 'In plain words: a tiny push that never stops beats a big push that runs out.'
      }
    ]
  },
  {
    id: 'L5',
    n: 5,
    title: 'Aerodynamics',
    icon: 'wings',
    blurb: 'Discover how air pushes on a rocket, why the atmosphere thins out, and how to keep a rocket stable and cool.',
    lessons: [
      {
        id: 'L5-1',
        title: 'Air pressure and density vs. altitude',
        minutes: 3,
        tagline: 'Air thins out fast as you climb, which changes rocket flight.',
        definition: 'Air pressure is the push of air on a surface; density is how much air mass fits in one cubic metre.',
        why: 'Drag, engine thrust, heating and parachutes all depend on how thick the air is.',
        explain: [
          'Air pressure is the weight of all the air above you. At sea level that is about 101,325 Pa, like 10 tonnes on each square metre. Higher up, less air sits overhead.',
          'The drop is roughly exponential: half by 5.5 km, a quarter by 11 km. Only 1% remains by 30 km. Density falls the same way, from 1.225 kg/m³ at sea level to about 0.41 at 10 km.',
          'In the lowest layer (troposphere, up to about 11 km) it gets about 6.5 °C colder per km. Space starts at the Kármán line, 100 km. Rockets pass the thick air quickly, then drag nearly vanishes.'
        ],
        keyIdeas: [
          'Pressure and density fall roughly exponentially.',
          'Half the air is below about 5.5 km.',
          'The troposphere cools about 6.5 °C per km.',
          'The Kármán line at 100 km is the agreed edge of space.'
        ],
        equations: [
          {
            name: 'Density from pressure (ideal gas)',
            formula: 'ρ = p ÷ (R × T)',
            vars: [
              ['ρ', 'air density', 'kg/m³'],
              ['p', 'air pressure', 'Pa'],
              ['R', 'gas constant of air (287)', 'J/(kg·K)'],
              ['T', 'temperature', 'K']
            ],
            meaning: 'Cold, high-pressure air is dense; warm, low-pressure air is thin.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'At 10 km: T about 223 K, pressure about 26,400 Pa.\nρ = p ÷ (R × T) = 26,400 ÷ (287 × 223).\nρ = about 0.41 kg/m³.\nCompare with sea level: 0.41 ÷ 1.225 = 0.34.\nPressure is about a quarter, density about a third.\nSo a rocket feels much less drag there.'
        },
        diagram: 'atmosphere',
        mistakes: [
          'Space has no sudden edge. The 100 km line is an agreement, not a wall.',
          'Air does not cool all the way up. It cools, then warms in the stratosphere and thermosphere.'
        ],
        recap: 'Pressure and density fall roughly exponentially, so most air is in the first 10 km. Rockets quickly reach near-empty space.',
        lab: {
          title: 'Try it: standard atmosphere',
          intro: 'Slide altitude (0 to 20 km) to see pressure, density and temperature.',
          inputs: [
            { id: 'h', label: 'Altitude', unit: 'km', min: 0, max: 20, step: 0.5, value: 10 }
          ],
          compute: (v) => {
            const a = isaAir(v.h);
            return [
              { label: 'Temperature', value: a.T - 273.15, unit: '°C', digits: 1 },
              { label: 'Pressure', value: a.p / 1000, unit: 'kPa', digits: 1 },
              { label: 'Density', value: a.rho, unit: 'kg/m³', digits: 3 },
              { label: 'Density vs. sea level', value: (a.rho / 1.225) * 100, unit: '%', digits: 0 }
            ];
          },
          note: 'Temperature stops falling at 11 km, but pressure keeps dropping.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch a rocket and show me a graph of air density and drag as it climbs.',
          screen: 'analysis'
        },
        quiz: [
          {
            q: 'About how much of the air\'s mass is below 5.5 km?',
            options: ['10%', 'About half', '90%', '1%'],
            answer: 1,
            why: 'Pressure there is half the sea-level value, so half the air is below.'
          },
          {
            q: 'Why does air pressure fall as you go up?',
            options: [
              'Gravity switches off',
              'There is less air above pushing down',
              'It gets colder',
              'The Sun pulls the air away'
            ],
            answer: 1,
            why: 'Pressure is the weight of air above, and there is less overhead.'
          },
          {
            q: 'Where is the usual edge of space (Kármán line)?',
            options: ['10 km', '50 km', '100 km', '400 km'],
            answer: 2,
            why: 'The Kármán line at 100 km is the common border.'
          }
        ],
        quick: [
          'Pressure comes from the weight of air above.',
          'Half the air is below 5.5 km.',
          'Rockets leave the thick air within about a minute.'
        ],
        eli15: 'In plain words: climbing is like coming out from under a pile of blankets, one layer at a time.'
      },
      {
        id: 'L5-2',
        title: 'Drag, drag coefficient and Max-Q',
        minutes: 4,
        tagline: 'Air pushes back on a rocket, hardest when speed and density combine.',
        definition: 'Drag is air resisting motion. Dynamic pressure q = ½ρv² is the air\'s push; Max-Q is the moment q peaks.',
        why: 'At Max-Q the air stresses the rocket most, so engineers may throttle down to stay safe.',
        explain: [
          'Hold your hand out of a car window: faster means harder push. Drag = ½ρv² × Cd × A, where Cd is a shape number. Double the speed and drag is four times bigger.',
          'A climbing rocket speeds up, but the air thins. So q first grows, then falls. The peak in between is Max-Q.',
          'Max-Q often comes 60 to 90 s after liftoff, at 10 to 14 km. Then q is about 20 to 40 kPa. Engines may throttle down briefly.'
        ],
        keyIdeas: [
          'Drag = ½ρv² × Cd × A.',
          'q = ½ρv² is how hard air pushes.',
          'Max-Q: rising speed meets falling density.',
          'Rockets often throttle down near Max-Q.'
        ],
        equations: [
          {
            name: 'Dynamic pressure',
            formula: 'q = ½ × ρ × v²',
            vars: [
              ['q', 'dynamic pressure', 'Pa'],
              ['ρ', 'air density', 'kg/m³'],
              ['v', 'speed through the air', 'm/s']
            ],
            meaning: 'How hard the moving air would press if you stopped it.'
          },
          {
            name: 'Drag force',
            formula: 'D = q × Cd × A',
            vars: [
              ['D', 'drag force', 'N'],
              ['q', 'dynamic pressure', 'Pa'],
              ['Cd', 'drag coefficient', ''],
              ['A', 'frontal area', 'm²']
            ],
            meaning: 'Drag is the dynamic pressure times how slippery and how big the rocket is.'
          }
        ],
        example: {
          title: 'Worked example',
          text: '3.7 m wide rocket, v = 400 m/s, ρ = 0.41, Cd = 0.4.\nArea A = π × 1.85² = about 10.75 m².\nq = ½ × 0.41 × 400² = 32,800 Pa.\nD = 32,800 × 0.4 × 10.75 = about 141 kN.\nAt 800 m/s in the same air, q and drag are four times larger.'
        },
        diagram: 'thrust-drag',
        mistakes: [
          'Max-Q is not top speed. Rockets keep speeding up after it.',
          'Drag is not proportional to speed. It grows with speed squared.'
        ],
        recap: 'Drag depends on density, speed squared, Cd and area. Dynamic pressure peaks at Max-Q, the moment of most stress.',
        lab: {
          title: 'Try it: dynamic pressure and drag',
          intro: 'Change air density and speed to see q and drag.',
          inputs: [
            { id: 'rho', label: 'Air density', unit: 'kg/m³', min: 0.001, max: 1.225, step: 0.005, value: 0.41 },
            { id: 'v', label: 'Speed', unit: 'm/s', min: 0, max: 1500, step: 10, value: 400 },
            { id: 'cd', label: 'Drag coefficient', unit: '', min: 0.1, max: 1.2, step: 0.05, value: 0.4 },
            { id: 'd', label: 'Rocket diameter', unit: 'm', min: 0.1, max: 10, step: 0.1, value: 3.7 }
          ],
          compute: (v) => {
            const q = 0.5 * v.rho * v.v * v.v;
            const A = Math.PI * Math.pow(v.d / 2, 2);
            return [
              { label: 'Dynamic pressure', value: q / 1000, unit: 'kPa', digits: 1 },
              { label: 'Frontal area', value: A, unit: 'm²', digits: 2 },
              { label: 'Drag force', value: (q * v.cd * A) / 1000, unit: 'kN', digits: 1 }
            ];
          },
          note: 'Double the speed and drag quadruples. Lower the density to see why high flight is gentle.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch my rocket and tell me when it reaches Max-Q and how large the dynamic pressure is.',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'A rocket doubles its speed in the same air. Drag becomes about...',
            options: ['2 times bigger', '4 times bigger', '8 times bigger', 'The same'],
            answer: 1,
            why: 'Drag depends on v², so 2 × 2 = 4 times bigger.'
          },
          {
            q: 'Why does dynamic pressure peak at Max-Q?',
            options: [
              'The engines shut down',
              'Speed rises while density falls, so q peaks',
              'The rocket hits the Kármán line',
              'Gravity is strongest there'
            ],
            answer: 1,
            why: 'Early on, rising v wins. Later, falling ρ wins. The peak is between.'
          },
          {
            q: 'What do some rockets do near Max-Q?',
            options: ['Turn off engines forever', 'Throttle down briefly', 'Drop their fins', 'Open parachutes'],
            answer: 1,
            why: 'A short throttle-down cuts peak load at little cost.'
          }
        ],
        quick: [
          'Drag grows with speed squared.',
          'Max-Q is the peak of the air\'s push.',
          'Rockets often throttle down near Max-Q.'
        ],
        eli15: 'In plain words: hold your hand out of a car window; faster means a harder push, but thinner air means less.'
      },
      {
        id: 'L5-3',
        title: 'Lift, stability, fins and nose shape',
        minutes: 4,
        tagline: 'Stable rockets have the air\'s push point behind the balance point.',
        definition: 'Center of mass (CG) is the balance point. Center of pressure (CP) is where air forces act when the rocket tilts.',
        why: 'If a rocket turns sideways, air forces can flip it. Stability keeps it pointing the right way.',
        explain: [
          'Think of a dart: heavy tip, feathers behind. If knocked sideways, air pushes the feathers and swings the tail back. That is stability.',
          'Treat the air\'s sideways push as acting at the CP. CP behind CG turns the nose back into the wind; CP ahead makes it tumble. Margin is in calibers (body widths).',
          'Big rockets have heavy engines at the back, so many are unstable and steer with their engines. Pointed noses slice supersonic air with least drag; blunt ones suit capsules.'
        ],
        keyIdeas: [
          'Stable means CP behind CG.',
          'Fins move CP back; nose weight moves CG forward.',
          'Margin is measured in calibers.',
          'Pointed nose: less drag. Blunt: re-entry.'
        ],
        equations: [
          {
            name: 'Stability margin',
            formula: 'Margin = (x_CP − x_CG) ÷ d',
            vars: [
              ['x_CP', 'CP distance from the nose', 'm'],
              ['x_CG', 'CG distance from the nose', 'm'],
              ['d', 'body diameter', 'm']
            ],
            meaning: 'How many body widths the CP sits behind the CG: positive is stable.'
          },
          {
            name: 'Lift force',
            formula: 'L = ½ × ρ × v² × CL × A',
            vars: [
              ['L', 'lift', 'N'],
              ['ρ', 'air density', 'kg/m³'],
              ['v', 'speed', 'm/s'],
              ['CL', 'lift coefficient', ''],
              ['A', 'reference area', 'm²']
            ],
            meaning: 'Lift grows with air density, speed squared and wing area.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Model rocket 1.0 m long, 0.06 m wide, CG at 0.58 m.\nCP at 0.50 m: (0.50 − 0.58) ÷ 0.06 = −1.3. Unstable.\nAdd fins so CP is at 0.68 m.\n(0.68 − 0.58) ÷ 0.06 = 1.67 calibers. Stable.\nNose weight moving CG to 0.55 m gives 2.2 calibers.'
        },
        diagram: 'stability',
        mistakes: [
          'Stable does not mean mass at the back. CP must be behind CG.',
          'More fins are not always better. Too much stability turns the rocket hard into wind.'
        ],
        recap: 'A rocket is stable when CP is behind CG. Fins and nose weight achieve that.',
        lab: {
          title: 'Try it: stability margin',
          intro: 'Move the CP and CG to see if the rocket is stable.',
          inputs: [
            { id: 'cp', label: 'CP from nose', unit: 'm', min: 0.2, max: 1, step: 0.01, value: 0.68 },
            { id: 'cg', label: 'CG from nose', unit: 'm', min: 0.2, max: 1, step: 0.01, value: 0.58 },
            { id: 'd', label: 'Body diameter', unit: 'm', min: 0.02, max: 0.5, step: 0.01, value: 0.06 }
          ],
          compute: (v) => {
            const d = Math.max(v.d, 1e-3);
            const m = (v.cp - v.cg) / d;
            return [
              { label: 'Stability margin', value: m, unit: 'calibers', digits: 2 },
              { label: 'Stable? (1 = yes, 0 = no)', value: m > 0 ? 1 : 0, unit: '', digits: 0 }
            ];
          },
          note: 'Slide the CG toward the tail and watch the margin drop below zero.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build me a tall rocket with no fins, then tell me if it will be aerodynamically stable and how to fix it.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'For a stable rocket, where should the CP be?',
            options: [
              'Ahead of the center of mass',
              'Behind the center of mass',
              'Exactly at the nose',
              'It does not matter'
            ],
            answer: 1,
            why: 'With CP behind CG, a tilt turns the nose back into the flow.'
          },
          {
            q: 'What do tail fins do?',
            options: [
              'Make the rocket heavier at the nose',
              'Move the center of pressure toward the tail',
              'Make more thrust',
              'Cool the engine'
            ],
            answer: 1,
            why: 'Fins add area at the back, moving the CP rearward.'
          },
          {
            q: 'Width 0.10 m, CP 0.75 m, CG 0.60 m. What is the margin?',
            options: ['0.15 calibers', '1.5 calibers', '15 calibers', '-1.5 calibers'],
            answer: 1,
            why: '(0.75 − 0.60) ÷ 0.10 = 1.5 calibers, positive, so stable.'
          }
        ],
        quick: [
          'Stable means CP is behind CG.',
          'Fins move CP back; nose weight moves CG forward.',
          'Pointed noses cut drag; blunt noses help on re-entry.'
        ],
        eli15: 'In plain words: a dart flies straight because its feathers are at the back and its weight is at the front.'
      },
      {
        id: 'L5-4',
        title: 'Supersonic flight, Mach and re-entry heating',
        minutes: 4,
        tagline: 'Past the speed of sound, air acts differently. Re-entry is a fireball.',
        definition: 'Mach number is speed divided by the local speed of sound. A heat shield protects a spacecraft during re-entry.',
        why: 'Drag jumps near Mach 1, and at orbital speed the air ahead of a capsule gets extremely hot.',
        explain: [
          'Sound moves about 340 m/s at sea level, but 295 m/s at 11 km where it is colder. Mach = speed ÷ speed of sound. Near Mach 1 air piles into shock waves (sudden jumps in pressure) and drag climbs steeply.',
          'A capsule returning from low orbit moves at 7.8 km/s, about Mach 25. Each kilogram carries about 30 MJ of energy, and slowing down turns it all into heat.',
          'Most heat comes from squashing air into a shock wave, not friction. Blunt shapes keep the hot gas away from the surface. Shields are ablative (chars away, carrying heat off) or insulating tiles (Shuttle, about 1,500 °C).'
        ],
        keyIdeas: [
          'Mach = speed ÷ speed of sound.',
          'Drag rises steeply near Mach 1.',
          'Re-entry heat comes from compressed air.',
          'Blunt shapes and heat shields protect capsules.'
        ],
        equations: [
          {
            name: 'Mach number and speed of sound',
            formula: 'M = v ÷ a, a = √(1.4 × 287 × T)',
            vars: [
              ['M', 'Mach number', ''],
              ['v', 'speed', 'm/s'],
              ['a', 'speed of sound', 'm/s'],
              ['T', 'air temperature', 'K']
            ],
            meaning: 'Colder air means a slower speed of sound, so the same speed is a higher Mach number.'
          },
          {
            name: 'Kinetic energy per kilogram',
            formula: 'E = ½ × v²',
            vars: [
              ['E', 'energy per kilogram', 'J/kg'],
              ['v', 'speed', 'm/s']
            ],
            meaning: 'Energy climbs with the square of speed, so orbital speed carries a massive amount to shed.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'At 10 km the air is 223 K.\nSound speed a = √(1.4 × 287 × 223) = about 299 m/s.\nAt 400 m/s: M = 400 ÷ 299 = about 1.34.\nRe-entry at 7,800 m/s: ½ × 7,800² = about 30.4 MJ per kg.\nA 1,000 kg capsule sheds about 30 billion joules.'
        },
        diagram: null,
        mistakes: [
          'Mach 1 is not always 340 m/s. It falls with temperature, about 295 m/s at 11 km.',
          'Re-entry heat is mostly compression, not friction. A pointed nose would overheat.'
        ],
        recap: 'Mach compares speed with sound speed. Re-entry at Mach 25 squashes air into extreme heat, so capsules are blunt with heat shields.',
        lab: {
          title: 'Try it: Mach number',
          intro: 'Enter speed and air temperature to get Mach number and energy.',
          inputs: [
            { id: 'v', label: 'Speed', unit: 'm/s', min: 0, max: 8000, step: 10, value: 400 },
            { id: 't', label: 'Air temperature', unit: '°C', min: -80, max: 40, step: 1, value: -50 }
          ],
          compute: (v) => {
            const T = Math.max(v.t + 273.15, 1);
            const a = Math.sqrt(1.4 * 287.05 * T);
            return [
              { label: 'Speed of sound', value: a, unit: 'm/s', digits: 0 },
              { label: 'Mach number', value: v.v / a, unit: '', digits: 2 },
              { label: 'Kinetic energy per kg', value: (0.5 * v.v * v.v) / 1e6, unit: 'MJ/kg', digits: 3 }
            ];
          },
          note: 'Set 7,800 m/s to see the energy a returning capsule must shed.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Simulate a capsule re-entering from low Earth orbit and show me its speed, Mach number and heating.',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'What does Mach 2 mean?',
            options: ['2 km/s', 'Twice the local speed of sound', 'Twice the speed of light', 'Two times Earth\'s gravity'],
            answer: 1,
            why: 'Mach compares your speed with the local speed of sound.'
          },
          {
            q: 'What mainly causes re-entry heating?',
            options: ['Rubbing friction', 'Air squashed into a shock wave', 'Sunlight', 'The engine'],
            answer: 1,
            why: 'The capsule compresses air so fast that it heats to thousands of degrees.'
          },
          {
            q: 'Why are capsules blunt?',
            options: [
              'Easier to build',
              'The shock wave carries heat away from the surface',
              'Blunt shapes have no drag',
              'Blunt shapes fly faster'
            ],
            answer: 1,
            why: 'A blunt nose pushes hot gas off the surface.'
          }
        ],
        quick: [
          'Mach 1 is the speed of sound, which varies with temperature.',
          'Drag jumps near Mach 1 because of shock waves.',
          'Re-entry heat mostly comes from squeezing air.'
        ],
        eli15: 'In plain words: a bike pump gets hot when you squash air, and a capsule squashes air at Mach 25.'
      }
    ]
  },
  {
    id: 'L6',
    n: 6,
    title: 'Flight Dynamics',
    icon: 'target',
    blurb: 'See how a rocket really climbs to orbit, which losses cost speed, and how it is steered.',
    lessons: [
      {
        id: 'L6-1',
        title: 'The ascent trajectory',
        minutes: 4,
        tagline: 'Reaching orbit is mostly about going sideways fast.',
        definition: 'A trajectory is a rocket\'s path. An orbit is a path where a craft keeps falling around a planet without hitting it.',
        why: 'The whole flight profile shows why rockets pitch over and need so much speed.',
        explain: [
          'Going straight up to 200 km needs only about 2 km/s. Staying in orbit there needs about 7.8 km/s sideways. About 94% of the energy goes into speed.',
          'A launch: vertical rise, gradual pitch over, Max-Q, then first stage burnout. The upper stage then accelerates nearly horizontally. A short burn at the top of the arc circularizes (rounds) the orbit.',
          'Liftoff TWR must be above 1, typically 1.2 to 1.5. Orbit speed is v = √(μ ÷ r). Real Δv is 9.3 to 9.5 km/s because of losses (see L6-3).'
        ],
        keyIdeas: [
          'Orbit is a sideways speed problem: 7.8 km/s.',
          'Phases: rise, pitch over, stage, coast, circularize.',
          'Liftoff TWR must be above 1.',
          'Total Δv to low orbit is about 9.3 to 9.5 km/s.'
        ],
        equations: [
          {
            name: 'Circular orbit speed',
            formula: 'v = √(μ ÷ (R + h))',
            vars: [
              ['v', 'orbital speed', 'm/s'],
              ['μ', 'Earth gravity constant (3.986 × 10¹⁴)', 'm³/s²'],
              ['R', 'Earth radius (6.371 × 10⁶)', 'm'],
              ['h', 'altitude', 'm']
            ],
            meaning: 'The higher the orbit, the slower the speed needed to stay in it.'
          },
          {
            name: 'Thrust-to-weight ratio',
            formula: 'TWR = F ÷ (m × g)',
            vars: [
              ['TWR', 'thrust-to-weight ratio', ''],
              ['F', 'thrust', 'N'],
              ['m', 'rocket mass', 'kg'],
              ['g', 'gravity (9.81)', 'm/s²']
            ],
            meaning: 'A TWR above 1 means the engines can lift the rocket off the pad.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Compare climbing with going around, at 200 km (r = 6,571 km).\nClimb energy: μ × (1/R − 1/r) = about 1.9 MJ/kg.\nOrbit speed: √(3.986 × 10¹⁴ ÷ 6.571 × 10⁶) = about 7,790 m/s.\nMotion energy: ½ × 7,790² = about 30.3 MJ/kg.\n30.3 ÷ (30.3 + 1.9) = about 94% goes into speed.'
        },
        diagram: 'gravity-turn',
        mistakes: [
          'Orbit is not just being high. At 400 km gravity is still about 90%; the craft is falling around Earth.',
          'Rockets do not fly straight up to space. They tip over early and go mostly sideways.'
        ],
        recap: 'Reaching orbit means gaining about 7.8 km/s sideways, not just climbing. A final burn circularizes the orbit.',
        lab: {
          title: 'Try it: orbit speed and period',
          intro: 'Pick an orbit altitude to see the speed needed and the lap time.',
          inputs: [
            { id: 'h', label: 'Orbit altitude', unit: 'km', min: 150, max: 2000, step: 10, value: 200 }
          ],
          compute: (v) => {
            const r = R_EARTH + v.h * 1000;
            const speed = Math.sqrt(MU_EARTH / r);
            const period = (2 * Math.PI * Math.sqrt((r * r * r) / MU_EARTH)) / 60;
            return [
              { label: 'Orbital speed', value: speed, unit: 'm/s', digits: 0 },
              { label: 'Orbital period', value: period, unit: 'min', digits: 1 },
              { label: 'Speed needed straight up to same height', value: Math.sqrt(2 * MU_EARTH * (1 / R_EARTH - 1 / r)), unit: 'm/s', digits: 0 }
            ];
          },
          note: 'Even at 2,000 km you still need about 6.9 km/s sideways.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch a two-stage rocket to a 200 km low Earth orbit and walk me through each phase of the ascent.',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'About how fast must a craft go sideways to orbit low?',
            options: ['About 780 m/s', 'About 7.8 km/s', 'About 78 km/s', 'About 300 km/h'],
            answer: 1,
            why: 'Low circular orbit speed is about 7.8 km/s, over 28,000 km/h.'
          },
          {
            q: 'What is the circularization burn for?',
            options: [
              'To slow down for landing',
              'To raise the low point of the orbit',
              'To open payload doors',
              'To reach the Moon'
            ],
            answer: 1,
            why: 'Without it the orbit dips back into the atmosphere.'
          },
          {
            q: 'Thrust 1.4 MN, mass 100,000 kg. What is the TWR?',
            options: ['0.7', '1.4', '14', '140'],
            answer: 1,
            why: 'Weight = 981,000 N. TWR = 1,400,000 ÷ 981,000 = about 1.4.'
          }
        ],
        quick: [
          'Orbit needs about 7.8 km/s sideways.',
          'Flight: rise, pitch over, stage, coast, circularize.',
          'Total Δv to orbit is about 9.3 km/s.'
        ],
        eli15: 'In plain words: orbiting is throwing a ball so fast sideways that the ground curves away before it lands.'
      },
      {
        id: 'L6-2',
        title: 'Gravity turn and the pitch program',
        minutes: 4,
        tagline: 'Let gravity bend the path, and the air barely pushes sideways.',
        definition: 'A gravity turn lets gravity bend a rocket\'s path toward horizontal. A pitch program is a planned table of nose angle against time.',
        why: 'A gravity turn is efficient and puts the least sideways stress on a rocket in thick air.',
        explain: [
          'Toss a ball up with a slight lean: gravity bends its path into an arc. A rocket climbs, gets a small pitch kick, then points along its velocity. Gravity curves the path.',
          'Flight path angle γ is the velocity angle above the horizontal (90° is up). The turn rate is (g − v²/r) × cos γ ÷ v, so faster means a slower turn.',
          'At orbital speed v²/r nearly equals g, so the net pull is about zero. Real rockets follow a pitch program, keeping angle of attack near zero through Max-Q.'
        ],
        keyIdeas: [
          'Vertical start, small kick, follow velocity.',
          'Gravity bends the path; faster turns slower.',
          'Near-zero angle of attack means little side load.',
          'At orbital speed, gravity is balanced by v²/r.'
        ],
        equations: [
          {
            name: 'Gravity turn rate',
            formula: 'dγ/dt = −(g − v²÷r) × cos γ ÷ v',
            vars: [
              ['dγ/dt', 'rate the flight path bends (downward)', 'rad/s'],
              ['g', 'gravity at that height', 'm/s²'],
              ['v', 'speed', 'm/s'],
              ['r', 'distance from Earth\'s centre', 'm'],
              ['γ', 'flight path angle above horizontal', 'deg']
            ],
            meaning: 'Gravity turns the path most when the rocket is moving slowly and is not pointing straight up or straight along the ground.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'After the kick: v = 100 m/s, γ = 89°.\nRate = 9.8 × cos 89° ÷ 100 = 0.0017 rad/s.\nThat is about 0.1 degree per second. Very slow.\nLater: v = 300 m/s, γ = 60°.\nRate = 9.8 × 0.5 ÷ 300 = 0.0163 rad/s.\nThat is about 0.94 degrees per second.'
        },
        diagram: 'gravity-turn',
        mistakes: [
          'The engine does not point sideways all the time. Only the small kick is commanded.',
          'A bigger kick is not always better. Too big turns early in thick air and wastes energy.'
        ],
        recap: 'After a small pitch kick, gravity bends the path toward horizontal. A pitch program stores the angles.',
        lab: {
          title: 'Try it: how fast does the path bend?',
          intro: 'Choose speed, path angle and altitude to see how fast the path bends.',
          inputs: [
            { id: 'v', label: 'Speed', unit: 'm/s', min: 20, max: 8000, step: 10, value: 300 },
            { id: 'gam', label: 'Flight path angle (90 = up)', unit: '°', min: 0, max: 90, step: 1, value: 60 },
            { id: 'h', label: 'Altitude', unit: 'km', min: 0, max: 400, step: 5, value: 0 }
          ],
          compute: (v) => {
            const r = R_EARTH + v.h * 1000;
            const g = G0 * Math.pow(R_EARTH / r, 2);
            const net = g - (v.v * v.v) / r;
            const rate = (net * Math.cos((v.gam * Math.PI) / 180)) / Math.max(v.v, 1);
            return [
              { label: 'Net pull (g − v²/r)', value: net, unit: 'm/s²', digits: 2 },
              { label: 'Path bends downward at', value: (rate * 180) / Math.PI, unit: '°/s', digits: 3 }
            ];
          },
          note: 'Set 7,800 m/s at 200 km. The net pull falls to almost zero: that is orbit.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch my rocket with a gravity turn: vertical for 10 seconds, then a small pitch kick, and show me the flight path angle over time.',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'What does the pitch kick do?',
            options: [
              'Starts the path bending from vertical',
              'Shuts the engine off',
              'Separates the stages',
              'Fires the parachute'
            ],
            answer: 0,
            why: 'A small tilt gives gravity a sideways lever.'
          },
          {
            q: 'Why is near-zero angle of attack good in a gravity turn?',
            options: [
              'It saves paint',
              'Air does not push sideways on the rocket',
              'It makes the rocket lighter',
              'It removes gravity'
            ],
            answer: 1,
            why: 'Air hits head-on, so side load is small.'
          },
          {
            q: 'What happens to net pull (g − v²/r) at orbital speed?',
            options: ['It doubles', 'It stays the same', 'It falls to roughly zero', 'It points upward'],
            answer: 2,
            why: 'The curve\'s v²/r balances gravity, so the craft circles Earth.'
          }
        ],
        quick: [
          'Fly up, give a small kick, then follow the path.',
          'Gravity does the steering for free.',
          'At orbital speed, gravity is balanced by the curve.'
        ],
        eli15: 'In plain words: toss a ball up with a slight lean and gravity bends its path into an arc.'
      },
      {
        id: 'L6-3',
        title: 'Losses and the Earth-rotation bonus',
        minutes: 4,
        tagline: 'Orbit needs about 9.3 km/s of Δv, and Earth\'s spin helps a little.',
        definition: 'Gravity, drag and steering losses are extra Δv spent on things other than orbit speed. Rotation bonus is the eastward speed Earth\'s spin already gives.',
        why: 'These numbers explain the big Δv of launches and why launch sites sit near the equator.',
        explain: [
          'Orbit needs about 7.8 km/s, but rockets need roughly 9.3 to 9.5 km/s of Δv. The rest goes to losses.',
          'Gravity loss is biggest, about 1.2 to 1.5 km/s, since gravity pulls during the whole burn. Drag loss is about 0.1 to 0.2 km/s. Steering loss is about 0.1 to 0.3 km/s.',
          'Earth spins: the equator moves east at 465 m/s; at latitude φ, 465 × cos φ. Launching east uses it for free. That is why Kourou (5° N) is a good site.'
        ],
        keyIdeas: [
          'Δv ≈ orbit speed + losses − rotation bonus.',
          'Gravity loss is biggest; higher TWR cuts it.',
          'Equator speed is about 465 m/s.',
          'East launches gain; west launches lose.'
        ],
        equations: [
          {
            name: 'Δv budget',
            formula: 'Δv ≈ v_orbit + Δv_gravity + Δv_drag + Δv_steering − v_rotation',
            vars: [
              ['Δv', 'total speed change the rocket must supply', 'm/s'],
              ['v_orbit', 'orbital speed (about 7,800)', 'm/s'],
              ['Δv_gravity, Δv_drag, Δv_steering', 'losses', 'm/s'],
              ['v_rotation', 'launch-direction rotation bonus', 'm/s']
            ],
            meaning: 'The rocket pays for the orbit speed plus its losses, minus what Earth gives for free.'
          },
          {
            name: 'Rotation bonus',
            formula: 'v_rotation = 465 × cos(latitude) × sin(azimuth)',
            vars: [
              ['v_rotation', 'bonus along launch direction', 'm/s'],
              ['latitude', 'launch site latitude', '°'],
              ['azimuth', 'launch direction, clockwise from north (90° = due east)', '°']
            ],
            meaning: 'The bonus is biggest for an eastward launch from the equator.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Launch due east from Cape Canaveral (28.5° N).\nBonus = 465 × cos 28.5° = about 409 m/s.\nBudget: 7,800 + 1,500 + 200 + 200 = 9,700 m/s.\nSubtract bonus: 9,700 − 409 = about 9,290 m/s.\nSo the rocket supplies about 9.3 km/s.'
        },
        diagram: null,
        mistakes: [
          'Losses do not mean bad design. Every rocket has them; good design keeps them small.',
          'Earth\'s spin helps only some launches. Polar launches get almost none, and west launches lose.'
        ],
        recap: 'Losses make orbit cost more than orbital speed. Launching east near the equator repays up to 465 m/s.',
        lab: {
          title: 'Try it: rotation bonus',
          intro: 'Choose launch latitude and direction to see Earth\'s speed bonus.',
          inputs: [
            { id: 'lat', label: 'Launch latitude', unit: '°', min: 0, max: 80, step: 0.5, value: 28.5 },
            { id: 'az', label: 'Launch azimuth (90 = east)', unit: '°', min: 0, max: 360, step: 5, value: 90 }
          ],
          compute: (v) => {
            const site = 465.1 * Math.cos((v.lat * Math.PI) / 180);
            const bonus = site * Math.sin((v.az * Math.PI) / 180);
            return [
              { label: 'Ground speed at the site', value: site, unit: 'm/s', digits: 0 },
              { label: 'Bonus in launch direction', value: bonus, unit: 'm/s', digits: 0 },
              { label: 'Orbital speed you still supply (of about 7,800)', value: 7800 - bonus, unit: 'm/s', digits: 0 }
            ];
          },
          note: 'Try azimuth 180 (south) for almost no bonus, and 270 (west) for a penalty.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Compare launching the same rocket due east from the equator and due east from a site at 60 degrees north, and explain the payload difference.',
          screen: 'planner'
        },
        quiz: [
          {
            q: 'About how fast does the equator move due to Earth\'s spin?',
            options: ['About 46 m/s', 'About 465 m/s', 'About 4.6 km/s', 'About 46 km/s'],
            answer: 1,
            why: 'About 40,075 km in one day is roughly 465 m/s.'
          },
          {
            q: 'Which loss on the way to orbit is usually largest?',
            options: ['Gravity loss', 'Drag loss', 'Steering loss', 'Loss of the fairing'],
            answer: 0,
            why: 'Gravity loss is 1.2 to 1.5 km/s, much more than drag or steering.'
          },
          {
            q: 'How can a designer reduce gravity loss?',
            options: ['Launch more slowly', 'Higher TWR for a shorter burn', 'Add more payload', 'Fly straight up longer'],
            answer: 1,
            why: 'A shorter burn means less time fighting gravity.'
          }
        ],
        quick: [
          'Losses add about 1.5 to 2 km/s to the bill.',
          'Gravity loss is the biggest of them.',
          'Launching east near the equator gets a free boost.'
        ],
        eli15: 'In plain words: running up a moving walkway that helps you if you run the same way.'
      },
      {
        id: 'L6-4',
        title: 'Angle of attack, stability and control axes',
        minutes: 4,
        tagline: 'Rockets steer around three axes: pitch, yaw and roll.',
        definition: 'Angle of attack (α) is the angle between the rocket and the airflow. Pitch, yaw and roll are turns about its three axes.',
        why: 'The control system must keep α small in thick air, because gusts and steering errors can overload the structure.',
        explain: [
          'If the nose points along the direction of travel, α = 0 and air hits head-on. A gust makes α non-zero, and air pushes sideways. Side force is about q × A × 2 × α, so gusts near Max-Q matter most.',
          'Pitch is nose up or down, like nodding yes. Yaw is nose left or right, like shaking no. Roll is spinning about the long axis, like a screw.',
          'Most rockets gimbal (swivel) the engine a few degrees. That makes a torque (turning force) F × L × sin δ. Others use RCS thrusters (small gas jets), fins or reaction wheels.'
        ],
        keyIdeas: [
          'Angle of attack is measured from the airflow.',
          'Side force grows with q and α.',
          'Three axes: pitch, yaw, roll.',
          'Steering: gimbals, RCS, fins, wheels.'
        ],
        equations: [
          {
            name: 'Angle of attack from a crosswind',
            formula: 'α ≈ atan(v_cross ÷ v)',
            vars: [
              ['α', 'angle of attack', 'deg'],
              ['v_cross', 'sideways wind speed', 'm/s'],
              ['v', 'forward speed', 'm/s']
            ],
            meaning: 'A sideways gust turns into a small angle of attack, bigger when the rocket is slow.'
          },
          {
            name: 'Side force and gimbal torque',
            formula: 'N ≈ q × A × 2 × α;  τ = F × L × sin δ',
            vars: [
              ['N', 'side force on a slender body', 'N'],
              ['q', 'dynamic pressure', 'Pa'],
              ['A', 'cross-section area', 'm²'],
              ['α', 'angle of attack', 'rad'],
              ['τ', 'steering torque', 'N·m'],
              ['F', 'thrust', 'N'],
              ['L', 'engine distance from center of mass', 'm'],
              ['δ', 'gimbal angle', 'deg']
            ],
            meaning: 'Air force grows with angle and pressure; steering torque grows with thrust, lever arm and gimbal angle.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Rocket 3.7 m wide (A = 10.75 m²), 300 m/s, ρ = 0.41.\nCrosswind 15 m/s. q = ½ × 0.41 × 300² = 18,450 Pa.\nα = atan(15 ÷ 300) = about 2.9° = 0.050 rad.\nSide force = 18,450 × 10.75 × 2 × 0.050 = about 19,800 N.\nSteer back: 1,000,000 N thrust, 20 m lever, 2° gimbal.\nTorque = 1,000,000 × 20 × sin 2° = about 700,000 N·m.'
        },
        diagram: 'gnc-loop',
        mistakes: [
          'Angle of attack is measured from the airflow, not from the horizon.',
          'Roll matters even for a round rocket. Spin can confuse steering and upset antennas and payload.'
        ],
        recap: 'Angle of attack must stay small in thick air. Rockets steer in pitch, yaw and roll using gimbals, thrusters and fins.',
        lab: {
          title: 'Try it: crosswind side force',
          intro: 'Enter speed, air density and crosswind to see α and side force.',
          inputs: [
            { id: 'v', label: 'Forward speed', unit: 'm/s', min: 50, max: 1500, step: 10, value: 300 },
            { id: 'rho', label: 'Air density', unit: 'kg/m³', min: 0.01, max: 1.225, step: 0.01, value: 0.41 },
            { id: 'w', label: 'Crosswind', unit: 'm/s', min: 0, max: 60, step: 1, value: 15 },
            { id: 'd', label: 'Rocket diameter', unit: 'm', min: 0.5, max: 10, step: 0.1, value: 3.7 }
          ],
          compute: (v) => {
            const speed = Math.max(v.v, 1);
            const alpha = Math.atan(v.w / speed);
            const q = 0.5 * v.rho * speed * speed;
            const A = Math.PI * Math.pow(v.d / 2, 2);
            return [
              { label: 'Angle of attack', value: (alpha * 180) / Math.PI, unit: '°', digits: 2 },
              { label: 'Dynamic pressure', value: q / 1000, unit: 'kPa', digits: 1 },
              { label: 'Side force', value: (q * A * 2 * alpha) / 1000, unit: 'kN', digits: 1 }
            ];
          },
          note: 'More crosswind means more side force. More speed lowers the angle but raises pressure.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch my rocket in a strong crosswind, show the angle of attack near Max-Q, and explain how the rocket steers to stay on course.',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'Angle of attack is the angle between...',
            options: ['Rocket and ground', 'Rocket centerline and airflow', 'Engine and tank', 'Sun and rocket'],
            answer: 1,
            why: 'It compares where the rocket points with where the air comes from.'
          },
          {
            q: 'Which motion is yaw?',
            options: [
              'Nose up or down',
              'Spinning about the long axis',
              'Nose swinging left or right',
              'Moving sideways in a straight line'
            ],
            answer: 2,
            why: 'Yaw is the left-right nose swing, like shaking your head no.'
          },
          {
            q: 'How does gimbaling an engine steer the rocket?',
            options: [
              'It makes the engine louder',
              'Off-center thrust makes a turning torque',
              'It changes the air density',
              'It lowers gravity'
            ],
            answer: 1,
            why: 'Swiveling aims thrust off the center of mass, turning the rocket.'
          }
        ],
        quick: [
          'Angle of attack is the rocket versus the airflow.',
          'Pitch is nod, yaw is shake, roll is spin.',
          'Rockets steer by swiveling the engine or firing thrusters.'
        ],
        eli15: 'In plain words: hold your hand flat out of a car window; tilt it and the air shoves it sideways.'
      }
    ]
  }
];
