// ASTRA LAB Aerospace Academy - levels 1-3
export default [
  {
    id: 'L1',
    n: 1,
    title: 'Aerospace Fundamentals',
    icon: 'rocket',
    blurb: 'Learn what aerospace engineers do, where the air ends and space begins, and what a rocket is made of.',
    lessons: [
      {
        id: 'L1-1',
        title: 'What is aerospace engineering?',
        minutes: 3,
        tagline: 'Engineers who design things that fly in the air and in space.',
        definition: 'Aerospace engineering is designing, building and testing aircraft, rockets and spacecraft.',
        why: 'A rocket has thousands of parts, and one weak part can end the mission, so everything must fit together.',
        explain: [
          'A rocket is a balancing act. It must be strong enough to survive launch, yet light enough to lift off. Engineers look for the best compromise.',
          'Aeronautics is flying through air: planes, helicopters, drones. Astronautics is leaving the air: rockets, satellites, probes (robot explorers) and rovers.',
          'Teams split the work: aerodynamics (air flow), propulsion (engines), structures (strength), control (steering) and heat. Then everything is tested with math, simulations and ground tests.'
        ],
        keyIdeas: [
          'Aeronautics is air flight; astronautics is space flight.',
          'Many specialists work together as a team.',
          'Every choice is a trade-off, like strength versus weight.',
          'Simulations find problems before real launches.'
        ],
        equations: [],
        example: {
          title: 'Worked example',
          text: 'Pick a material for a rocket tank.\nSteel: strong but heavy.\nAluminium: lighter but a bit weaker.\nEvery spare kilogram of tank is one less kilogram of payload (cargo).\nChoice: light aluminium, with walls just thick enough.\nEngineers make choices like this thousands of times.'
        },
        diagram: null,
        mistakes: [
          'It is not only rockets. Most engineers work on planes, satellites and engines too.',
          'A failed test is not wasted. It gives data that makes the next design better.'
        ],
        recap: 'Aerospace covers air flight and space flight. It is teamwork and trade-offs, checked by testing.',
        lab: null,
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build me a small rocket and explain the main design choices you made.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'Which word means flight in and to space?',
            options: ['Aeronautics', 'Astronautics', 'Aerodynamics', 'Avionics'],
            answer: 1,
            why: 'Astronautics is space flight. Aeronautics is flight inside the air.'
          },
          {
            q: 'Why is extra empty weight a problem for a rocket?',
            options: [
              'It makes the rocket louder',
              'It cuts payload or final speed',
              'It makes the sky darker',
              'It has no effect'
            ],
            answer: 1,
            why: 'The engine can lift only so much. Dead weight takes away useful cargo or speed.'
          },
          {
            q: 'What is the main benefit of simulation?',
            options: [
              'It replaces all real flights',
              'It finds problems before costly launches',
              'It makes rockets lighter',
              'It is only for video games'
            ],
            answer: 1,
            why: 'Simulations are cheap and safe, so you can test many ideas early.'
          }
        ],
        quick: [
          'Aeronautics means flying in the air.',
          'Astronautics means flying in and to space.',
          'Every design is a trade-off, tested before launch.'
        ],
        eli15: 'In plain words: it is like packing a bag that must be strong enough and light enough at once.'
      },
      {
        id: 'L1-2',
        title: 'The atmosphere and space',
        minutes: 3,
        tagline: 'Air thins out slowly. There is no sharp edge to space.',
        definition: 'The atmosphere is the layer of gas around Earth; above it is space, a near-vacuum (almost nothing there).',
        why: 'Air gives wings lift but also drag, which slows and heats a rocket, so designers must handle thick air and vacuum.',
        explain: [
          'Think of a pile of blankets. The bottom ones are squashed by the weight above, the top ones are fluffy. Air is densest at sea level and thins as you climb.',
          'Air pressure halves about every 5.5 km. On Everest (8.8 km) it is only about one third of sea level. Space has no sharp edge, but the Karman line at 100 km is the agreed border.',
          'Gravity is still about 90% as strong at the ISS (400 km up). Astronauts float because they are in constant free fall around Earth.'
        ],
        keyIdeas: [
          'Pressure halves about every 5.5 km.',
          'The Karman line (100 km) is the agreed edge of space.',
          'In orbit, gravity is strong; floating is free fall.',
          'Vacuum means no air, so no drag.'
        ],
        equations: [
          {
            name: 'Rough pressure rule (lower atmosphere)',
            formula: 'p ≈ p₀ × (½)^(h ÷ 5.5 km)',
            vars: [
              ['p', 'air pressure at height h', 'kPa'],
              ['p₀', 'sea-level pressure (about 101 kPa)', 'kPa'],
              ['h', 'height above sea level', 'km']
            ],
            meaning: 'Every 5.5 km you climb, the air pressure is cut in half (a rough rule that works best below about 12 km).'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Air pressure at 11 km, where jets cruise:\n11 km ÷ 5.5 km = 2 halvings.\nPressure ≈ 101 × ½ × ½ = about 25 kPa.\nThe true value is about 23 kPa, so the rule is good.\nThat is why airliner cabins are pressurized.'
        },
        diagram: 'atmosphere',
        mistakes: [
          'There is no gravity in space is wrong. At 400 km it is still about 90% of ground level.',
          'Space has no wall. The 100 km line is just something people agreed on.'
        ],
        recap: 'Air thins smoothly with height and space starts at 100 km. Gravity stays strong in orbit; astronauts float in free fall.',
        lab: {
          title: 'Try it: air pressure at height',
          intro: 'Use the halving rule to estimate air pressure at different heights.',
          inputs: [
            { id: 'h', label: 'Height above sea level', unit: 'km', min: 0, max: 12, step: 0.5, value: 5.5 }
          ],
          compute: (v) => {
            const p = 101.3 * Math.pow(0.5, v.h / 5.5);
            return [
              { label: 'Estimated pressure', value: p, unit: 'kPa', digits: 1 },
              { label: 'Fraction of sea-level pressure', value: (p / 101.3) * 100, unit: '%', digits: 0 }
            ];
          },
          note: 'Try 5.5 km, then 11 km. Pressure halves each time. The rule fails much higher up.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch a rocket and show me how air density and drag change with altitude.',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'About how far up does air pressure halve?',
            options: ['About 55 m', 'About 550 m', 'About 5.5 km', 'About 55 km'],
            answer: 2,
            why: 'In the lower atmosphere, pressure halves about every 5.5 km.'
          },
          {
            q: 'Why do astronauts on the ISS float?',
            options: [
              'There is no gravity at 400 km',
              'They are in constant free fall',
              'The ISS is outside Earth\'s gravity',
              'Air pushes them up'
            ],
            answer: 1,
            why: 'Gravity is still about 90% there. Station and crew fall around Earth together.'
          },
          {
            q: 'Where is the agreed edge of space?',
            options: ['10 km', '50 km', '100 km', '1000 km'],
            answer: 2,
            why: 'The Karman line at 100 km is the common border.'
          }
        ],
        quick: [
          'Air gets thinner the higher you go.',
          'Space is said to start at 100 km.',
          'Astronauts float because they are falling, not because gravity is gone.'
        ],
        eli15: 'In plain words: air is like a pile of blankets, squashed at the bottom and fluffy at the top.'
      },
      {
        id: 'L1-3',
        title: 'How rockets differ from planes',
        minutes: 4,
        tagline: 'Planes use air. Rockets carry everything they need.',
        definition: 'A plane uses wings and air from outside; a rocket carries fuel and oxidizer (a chemical that supplies oxygen), so it works in vacuum.',
        why: 'This one difference is why rockets are mostly fuel and why reaching space is costly.',
        explain: [
          'A jet engine breathes: it sucks in air and burns fuel in it. A rocket is like a diver with a tank. It brings its own oxidizer, so it needs no outside air.',
          'Wings push air downward and the air pushes back up: that is lift. No air means no lift. A rocket gets thrust (push) by throwing hot gas backward fast.',
          'The cost is weight. Big rockets are about 85 to 95% propellant (fuel plus oxidizer). Orbit needs about 7,800 m/s sideways, roughly 30 times an airliner\'s speed.'
        ],
        keyIdeas: [
          'Rockets carry their own oxidizer.',
          'Wings cannot work in vacuum; rocket engines can.',
          'Rockets are mostly propellant by mass.',
          'Orbit needs sideways speed, not just height.'
        ],
        equations: [
          {
            name: 'Dynamic pressure',
            formula: 'q = ½ × ρ × v²',
            vars: [
              ['q', 'dynamic pressure (the push of moving air on a vehicle)', 'Pa'],
              ['ρ', 'air density', 'kg/m³'],
              ['v', 'speed relative to the air', 'm/s']
            ],
            meaning: 'The push of the air on a vehicle grows with the square of its speed, so going twice as fast means four times the load.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Compare air load (dynamic pressure q = ½ρv²).\nAirliner: 0.5 × 0.4 × 250² = 12,500 Pa.\nRocket: 0.5 × 0.3 × 400² = 24,000 Pa.\nThe rocket feels nearly double, because speed is squared.\nEngineers watch this peak, called max-Q.'
        },
        diagram: 'forces-flight',
        mistakes: [
          'Rockets do not push on air or ground. They push against their own exhaust.',
          'Space is not only about height. Staying up needs huge sideways speed.'
        ],
        recap: 'Planes need air; rockets carry what they need. So rockets are mostly propellant and must go very fast.',
        lab: {
          title: 'Try it: air load on a vehicle',
          intro: 'Find the air push (dynamic pressure) for a chosen density and speed.',
          inputs: [
            { id: 'rho', label: 'Air density', unit: 'kg/m³', min: 0.001, max: 1.225, step: 0.001, value: 0.4 },
            { id: 'v', label: 'Speed', unit: 'm/s', min: 1, max: 1500, step: 1, value: 250 }
          ],
          compute: (v) => [
            { label: 'Dynamic pressure q', value: 0.5 * v.rho * v.v * v.v, unit: 'Pa', digits: 0 },
            { label: 'Speed in km/h', value: v.v * 3.6, unit: 'km/h', digits: 0 }
          ],
          note: 'Double the speed and q becomes four times bigger. Thinner air lowers it.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch a rocket and show me the moment of maximum dynamic pressure (max-Q).',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'Why can a rocket work in space but a jet cannot?',
            options: ['Rockets are bigger', 'Rockets carry their own oxidizer', 'Jets are too cold', 'Rockets use wings'],
            answer: 1,
            why: 'A jet needs oxygen from air. A rocket brings its own.'
          },
          {
            q: 'About what share of a big rocket\'s mass is propellant?',
            options: ['About 5%', 'About 25%', 'About 50%', 'About 85 to 95%'],
            answer: 3,
            why: 'Most liftoff mass is fuel and oxidizer. Structure and payload are a small slice.'
          },
          {
            q: 'Speed doubles in the same air. Dynamic pressure becomes...',
            options: ['2 times', '4 times', '8 times', 'Unchanged'],
            answer: 1,
            why: 'q depends on v², so 2² = 4 times bigger.'
          }
        ],
        quick: [
          'Jets breathe air; rockets bring their own oxygen source.',
          'Wings need air, so they fail in space.',
          'Orbit needs huge sideways speed, about 7,800 m/s.'
        ],
        eli15: 'In plain words: a jet is a person breathing air, a rocket is a diver with an air tank.'
      },
      {
        id: 'L1-4',
        title: 'Main systems of a launch vehicle and spacecraft',
        minutes: 4,
        tagline: 'A space mission is many systems, each with one job.',
        definition: 'A system is a group of parts doing one job. A launch vehicle lifts things to space; a spacecraft works there.',
        why: 'A better engine may need heavier tanks and a stronger frame, so all systems must be designed together.',
        explain: [
          'Think of a body. A rocket has a structure (frame) and propulsion (tanks and engines). It also has avionics (electronics) and GNC (guidance, navigation and control), which steers it.',
          'Stages are sections that drop away when empty. The payload (the cargo) sits on top, covered by a nose cover called the fairing.',
          'A spacecraft also needs power (solar panels, batteries), radio and thermal control (not too hot or cold). Attitude control sets which way it points. The rest is the bus; the payload is the point.'
        ],
        keyIdeas: [
          'Rocket: structure, propulsion, avionics, GNC, stages, fairing.',
          'Spacecraft: power, radio, heat control, pointing.',
          'The payload is why the mission exists.',
          'Systems affect each other.'
        ],
        equations: [],
        example: {
          title: 'Worked example',
          text: 'Follow a weather satellite.\nLaunch: the structure carries the load, the fairing shields it.\nIn orbit: solar panels make power, batteries store some.\nThermal system keeps electronics warm.\nThe camera (payload) takes pictures; the radio sends them down.\nEach system has a mass budget (a kilogram limit).'
        },
        diagram: 'rocket-anatomy',
        mistakes: [
          'A rocket is not just an engine. Tanks and structure are much of its mass.',
          'The payload is usually only a few percent of liftoff mass.'
        ],
        recap: 'Rockets and spacecraft are made of systems that all serve the payload and are designed together.',
        lab: null,
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build me a two-stage rocket carrying a 100 kg space probe and name each of its main systems.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'What does GNC stand for?',
            options: [
              'Gas, nozzle, chamber',
              'Guidance, navigation and control',
              'Ground network center',
              'Gravity, noise and cooling'
            ],
            answer: 1,
            why: 'GNC works out where the vehicle is and steers it.'
          },
          {
            q: 'What does the fairing do?',
            options: ['Steers the rocket', 'Stores the fuel', 'Protects the payload in the air', 'Makes thrust'],
            answer: 2,
            why: 'The fairing shields the payload until the air is thin.'
          },
          {
            q: 'Which system gives a spacecraft electricity?',
            options: ['Power (panels and batteries)', 'Thermal system', 'Fairing', 'Structure'],
            answer: 0,
            why: 'Solar panels make electricity; batteries store it for shade.'
          }
        ],
        quick: [
          'A rocket has structure, engines, electronics and steering.',
          'A spacecraft adds power, radio and heat control.',
          'The payload is the reason for the mission.'
        ],
        eli15: 'In plain words: a rocket is like a body, with a skeleton, a heart, a brain and eyes.'
      }
    ]
  },
  {
    id: 'L2',
    n: 2,
    title: 'Newtonian Mechanics',
    icon: 'gauge',
    blurb: 'Understand mass, weight, forces, motion, momentum, energy and gravity: the physics behind every launch.',
    lessons: [
      {
        id: 'L2-1',
        title: 'Mass, weight and gravity',
        minutes: 3,
        tagline: 'Mass is how much stuff you have. Weight is gravity pulling on it.',
        definition: 'Mass is the amount of matter in an object (kg). Weight is the pull of gravity on that mass, in newtons (N).',
        why: 'A rocket\'s mass never changes, but its weight does. Engines must beat the weight to lift off.',
        explain: [
          'Mass is the amount of stuff in you. It does not change on the Moon. Weight is how hard gravity pulls that stuff down, so on the Moon you weigh about one sixth.',
          'Near Earth, gravity speeds up falling objects by g = 9.81 m/s² (speed grows 9.81 m/s each second). The Moon has 1.62 and Mars 3.71.',
          'Gravity weakens with distance: double the distance, one quarter of the pull. At the ISS (400 km up) it is still 8.7 m/s². Astronauts float only because they are falling.'
        ],
        keyIdeas: [
          'Mass (kg) stays put; weight (N) changes.',
          'g: Earth 9.81, Moon 1.62, Mars 3.71 m/s².',
          'Twice as far means one quarter of the pull.',
          'At 400 km, gravity is still about 8.7 m/s².'
        ],
        equations: [
          {
            name: 'Weight',
            formula: 'W = m × g',
            vars: [
              ['W', 'weight (force)', 'N'],
              ['m', 'mass', 'kg'],
              ['g', 'gravitational acceleration', 'm/s²']
            ],
            meaning: 'Weight is mass multiplied by how strongly gravity pulls each kilogram.'
          },
          {
            name: 'Newton\'s law of gravitation',
            formula: 'F = G × m₁ × m₂ ÷ r²',
            vars: [
              ['F', 'gravitational force', 'N'],
              ['G', 'gravitational constant (6.674 × 10⁻¹¹)', 'N·m²/kg²'],
              ['m₁, m₂', 'the two masses', 'kg'],
              ['r', 'distance between their centres', 'm']
            ],
            meaning: 'Any two masses pull on each other, more strongly if they are heavier or closer.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'An astronaut has a mass of 70 kg.\nEarth: W = 70 × 9.81 = about 687 N.\nMoon: W = 70 × 1.62 = about 113 N.\nAt 400 km: g = 9.81 × (6,371 ÷ 6,771)² = about 8.7 m/s².\nW = 70 × 8.7 = about 608 N.\nMass is 70 kg in every case.'
        },
        diagram: 'gravity-turn',
        mistakes: [
          'Mass and weight differ. Mass is in kg and constant; weight is a force in newtons.',
          'Gravity does not vanish in orbit. It is what keeps the spacecraft in orbit.'
        ],
        recap: 'Weight is gravity\'s pull on mass (W = m × g). Gravity weakens with distance squared but is strong in low orbit.',
        lab: {
          title: 'Try it: weight and gravity at altitude',
          intro: 'Pick a mass and a height above Earth to see g and weight.',
          inputs: [
            { id: 'm', label: 'Mass', unit: 'kg', min: 1, max: 10000, step: 1, value: 70 },
            { id: 'h', label: 'Height above Earth', unit: 'km', min: 0, max: 40000, step: 10, value: 400 }
          ],
          compute: (v) => {
            const R = 6371;
            const g = 9.81 * Math.pow(R / (R + v.h), 2);
            return [
              { label: 'Local gravity g', value: g, unit: 'm/s²', digits: 2 },
              { label: 'Weight', value: v.m * g, unit: 'N', digits: 0 },
              { label: 'Weight on the ground', value: v.m * 9.81, unit: 'N', digits: 0 }
            ];
          },
          note: 'Try 400 km (ISS) and 35,786 km (geostationary orbit) and watch g drop.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Compare the same lander on Earth, the Moon and Mars and show how gravity changes its weight and landing.',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'An astronaut has 80 kg mass. What is their mass on the Moon?',
            options: ['About 13 kg', 'About 80 kg', 'About 480 kg', 'Zero'],
            answer: 1,
            why: 'Mass does not change with place. Only weight does.'
          },
          {
            q: 'Double your distance from Earth\'s centre. Gravity becomes...',
            options: ['Half', 'One quarter', 'Double', 'Zero'],
            answer: 1,
            why: 'Inverse-square law: 1 ÷ 2² = 1/4.'
          },
          {
            q: 'What is the weight of a 10 kg object on Earth (g = 9.81)?',
            options: ['10 N', 'About 98 N', 'About 981 N', 'About 1 N'],
            answer: 1,
            why: 'W = m × g = 10 × 9.81 = 98.1 N.'
          }
        ],
        quick: [
          'Mass stays the same everywhere.',
          'Weight changes with gravity: W = m × g.',
          'Gravity is still strong in low orbit.'
        ],
        eli15: 'In plain words: mass is how much of you there is; weight is how hard a planet tugs on you.'
      },
      {
        id: 'L2-2',
        title: 'Force and Newton\'s three laws',
        minutes: 4,
        tagline: 'Forces change motion. Every push has an equal push back.',
        definition: 'A force is a push or pull, measured in newtons. One newton gives a 1 kg mass an acceleration of 1 m/s².',
        why: 'Newton\'s third law explains how a rocket moves at all, and his second law tells you how fast it speeds up.',
        explain: [
          'First law: an object keeps its motion unless a net force (all forces added up) acts on it. In space there is little friction. Probes coast for years.',
          'Second law: net force = mass × acceleration. A full shopping cart needs a bigger push than an empty one for the same speed-up.',
          'Third law: if A pushes on B, B pushes back on A equally. A rocket pushes hot gas backward, and the gas pushes the rocket forward. It lifts off only when thrust beats weight.'
        ],
        keyIdeas: [
          'First law: no net force, steady velocity.',
          'Second law: F = m × a.',
          'Third law: equal and opposite pairs, on different objects.',
          'Liftoff needs thrust bigger than weight.'
        ],
        equations: [
          {
            name: 'Newton\'s second law',
            formula: 'F = m × a',
            vars: [
              ['F', 'net force', 'N'],
              ['m', 'mass', 'kg'],
              ['a', 'acceleration', 'm/s²']
            ],
            meaning: 'The bigger the net force or the smaller the mass, the faster the speed changes.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'A 2,000 kg probe fires a 10,000 N thruster.\na = F ÷ m = 10,000 ÷ 2,000 = 5 m/s².\nAfter 10 s: speed gain = 5 × 10 = 50 m/s.\nDistance = ½ × 5 × 10² = 250 m.\nNo air, so it keeps that extra 50 m/s.'
        },
        diagram: 'newton3',
        mistakes: [
          'Action and reaction do not cancel, because they act on two different objects.',
          'Moving needs no force. Changing motion does. Friction and drag are forces that stop things.'
        ],
        recap: 'Net force changes motion (F = m × a). Forces come in equal, opposite pairs, so a rocket pushes on its exhaust.',
        lab: {
          title: 'Try it: force, mass and acceleration',
          intro: 'Apply a net force to a mass in space and watch it speed up.',
          inputs: [
            { id: 'F', label: 'Net force', unit: 'N', min: 1, max: 100000, step: 1, value: 10000 },
            { id: 'm', label: 'Mass', unit: 'kg', min: 1, max: 100000, step: 1, value: 2000 },
            { id: 't', label: 'Time', unit: 's', min: 1, max: 600, step: 1, value: 10 }
          ],
          compute: (v) => {
            const a = v.m > 0 ? v.F / v.m : 0;
            return [
              { label: 'Acceleration', value: a, unit: 'm/s²', digits: 2 },
              { label: 'Speed gained', value: a * v.t, unit: 'm/s', digits: 1 },
              { label: 'Distance covered', value: 0.5 * a * v.t * v.t, unit: 'm', digits: 0 }
            ];
          },
          note: 'Double the mass and acceleration halves. Double the force and it doubles.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build a rocket with too little thrust to lift off and explain why using Newton\'s laws.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'A net force of 600 N acts on 200 kg. What is the acceleration?',
            options: ['0.33 m/s²', '3 m/s²', '30 m/s²', '120,000 m/s²'],
            answer: 1,
            why: 'a = F ÷ m = 600 ÷ 200 = 3 m/s².'
          },
          {
            q: 'Why don\'t action and reaction forces cancel?',
            options: [
              'They are different sizes',
              'They act on different objects',
              'They happen at different times',
              'They are not real forces'
            ],
            answer: 1,
            why: 'Each force acts on a different object.'
          },
          {
            q: 'A probe coasting in deep space with no forces will...',
            options: ['Slow down and stop soon', 'Speed up steadily', 'Keep moving at constant velocity', 'Fall to Earth'],
            answer: 2,
            why: 'First law: with no net force, velocity stays the same.'
          }
        ],
        quick: [
          'No net force means no change in motion.',
          'Force = mass × acceleration (F = m × a).',
          'A rocket pushes gas back; the gas pushes it forward.'
        ],
        eli15: 'In plain words: jump off a skateboard and the board rolls away, just like a rocket and its exhaust.'
      },
      {
        id: 'L2-3',
        title: 'Velocity, acceleration and momentum',
        minutes: 4,
        tagline: 'Velocity is speed with direction. Momentum is mass times velocity.',
        definition: 'Velocity is speed with a direction; acceleration is how fast velocity changes; momentum is mass times velocity.',
        why: 'Rocket engines change velocity, and orbits are all about velocity. Momentum explains why throwing mass backward speeds a rocket up.',
        explain: [
          'Speed is a number like 20 m/s. Velocity adds direction, like 20 m/s upward. A satellite in a circle keeps changing direction, so it is always accelerating.',
          'An acceleration of 5 m/s² means speed grows by 5 m/s every second. 1 g is 9.81 m/s². Astronauts feel about 3 to 4 g at launch, like a heavy hand pressing them into the seat.',
          'Momentum is p = m × v. It is conserved (the total stays the same) if nothing pushes from outside. Exhaust flies back with momentum, so the rocket gains the same amount forward.'
        ],
        keyIdeas: [
          'Velocity = speed + direction.',
          '1 g = 9.81 m/s²; launches reach 3 to 4 g.',
          'Momentum p = m × v is conserved.',
          'Exhaust backward, rocket forward.'
        ],
        equations: [
          {
            name: 'Acceleration',
            formula: 'a = Δv ÷ Δt',
            vars: [
              ['a', 'acceleration', 'm/s²'],
              ['Δv', 'change in velocity', 'm/s'],
              ['Δt', 'time taken', 's']
            ],
            meaning: 'Acceleration is how much the velocity changes each second.'
          },
          {
            name: 'Momentum',
            formula: 'p = m × v',
            vars: [
              ['p', 'momentum', 'kg·m/s'],
              ['m', 'mass', 'kg'],
              ['v', 'velocity', 'm/s']
            ],
            meaning: 'Momentum grows with both mass and speed.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'A rocket speeds up from 0 to 200 m/s in 8 s.\na = Δv ÷ Δt = 200 ÷ 8 = 25 m/s².\nIn g: 25 ÷ 9.81 = about 2.5 g.\nFor 1,000 kg at the end: p = 1,000 × 200.\np = 200,000 kg·m/s.\nThe exhaust carries the same amount backward (ideal case).'
        },
        diagram: null,
        mistakes: [
          'Speed and velocity differ. Velocity has direction, so a circular orbit always changes it.',
          'Zero velocity does not mean zero acceleration. A ball at its top point is still pulled by gravity.'
        ],
        recap: 'Velocity has direction, acceleration is its rate of change, and momentum is m × v. Rockets work because momentum is conserved.',
        lab: {
          title: 'Try it: acceleration and momentum',
          intro: 'Enter a speed change, time and mass to get acceleration in g and momentum.',
          inputs: [
            { id: 'dv', label: 'Speed change', unit: 'm/s', min: 1, max: 3000, step: 1, value: 200 },
            { id: 'dt', label: 'Time taken', unit: 's', min: 1, max: 600, step: 1, value: 8 },
            { id: 'm', label: 'Mass', unit: 'kg', min: 1, max: 100000, step: 1, value: 1000 }
          ],
          compute: (v) => {
            const a = v.dt > 0 ? v.dv / v.dt : 0;
            return [
              { label: 'Acceleration', value: a, unit: 'm/s²', digits: 1 },
              { label: 'Acceleration in g', value: a / 9.81, unit: 'g', digits: 2 },
              { label: 'Final momentum (from rest)', value: v.m * v.dv, unit: 'kg·m/s', digits: 0 }
            ];
          },
          note: 'The same speed change in less time means more g on people and gear.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch a rocket and show me its acceleration in g during the whole flight.',
          screen: 'analysis'
        },
        quiz: [
          {
            q: 'A car speeds up from 0 to 30 m/s in 10 s. Its acceleration?',
            options: ['0.33 m/s²', '3 m/s²', '30 m/s²', '300 m/s²'],
            answer: 1,
            why: 'a = Δv ÷ Δt = 30 ÷ 10 = 3 m/s².'
          },
          {
            q: 'Momentum of a 500 kg probe moving at 20 m/s?',
            options: ['25 kg·m/s', '520 kg·m/s', '10,000 kg·m/s', '200,000 kg·m/s'],
            answer: 2,
            why: 'p = m × v = 500 × 20 = 10,000 kg·m/s.'
          },
          {
            q: 'Why is a satellite in circular orbit always accelerating?',
            options: [
              'Its speed keeps growing',
              'Its direction keeps changing',
              'It burns fuel constantly',
              'It is not accelerating'
            ],
            answer: 1,
            why: 'Velocity includes direction, and direction keeps changing around a circle.'
          }
        ],
        quick: [
          'Velocity means speed plus direction.',
          'Acceleration is how fast velocity changes.',
          'Rockets gain forward momentum from backward exhaust.'
        ],
        eli15: 'In plain words: momentum is how hard something is to stop, like a rolling truck versus a rolling ball.'
      },
      {
        id: 'L2-4',
        title: 'Energy: kinetic and potential',
        minutes: 4,
        tagline: 'Reaching orbit takes much more energy for speed than for height.',
        definition: 'Energy is the ability to do work (joules, J). Kinetic energy is motion energy; potential energy is stored by height.',
        why: 'Energy tells us how much fuel a mission needs, why orbit is mostly speed, and why re-entry makes heat.',
        explain: [
          'Kinetic energy is energy of motion. It grows with the square of speed, so doubling speed gives four times the energy.',
          'Potential energy is energy stored by lifting, like a ball on a shelf: m × g × h. Energy only changes form. A rocket turns chemical energy into speed, height and some heat.',
          'For 1,000 kg in a 400 km orbit, speed needs about 30 billion joules; height only 3.7 billion. On return, that speed turns into heat. That is why capsules have heat shields.'
        ],
        keyIdeas: [
          'Kinetic energy = ½ m v².',
          'Potential energy near ground = m g h.',
          'Energy changes form but is never lost.',
          'Orbit is mostly speed, not height.'
        ],
        equations: [
          {
            name: 'Kinetic energy',
            formula: 'Eₖ = ½ × m × v²',
            vars: [
              ['Eₖ', 'kinetic energy', 'J'],
              ['m', 'mass', 'kg'],
              ['v', 'speed', 'm/s']
            ],
            meaning: 'Moving objects carry energy that grows with the square of their speed.'
          },
          {
            name: 'Potential energy (near the ground)',
            formula: 'Eₚ = m × g × h',
            vars: [
              ['Eₚ', 'potential energy', 'J'],
              ['m', 'mass', 'kg'],
              ['g', 'gravity (9.81)', 'm/s²'],
              ['h', 'height', 'm']
            ],
            meaning: 'The higher you lift a mass, the more energy it stores (valid for heights small compared with Earth\'s radius).'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'A 1,000 kg satellite moves at 7,700 m/s.\nEₖ = ½ × 1,000 × 7,700² = about 3.0 × 10¹⁰ J.\nThat is about 30 GJ (gigajoules, billions of joules).\nHeight to 400 km: about 3.7 × 10⁹ J.\n(The simple m g h gives 3.9 × 10⁹, since g falls with height.)\nSpeed needs about eight times more energy.'
        },
        diagram: 'orbit',
        mistakes: [
          'Orbit is not just going up. Most energy goes into sideways speed.',
          'Energy is not used up. It changes form, for example into heat during re-entry.'
        ],
        recap: 'Kinetic energy is ½ m v²; potential energy is m g h. Orbit is mostly speed, and that energy returns as heat.',
        lab: {
          title: 'Try it: kinetic and potential energy',
          intro: 'Choose mass, speed and height to compare the two kinds of energy.',
          inputs: [
            { id: 'm', label: 'Mass', unit: 'kg', min: 1, max: 100000, step: 1, value: 1000 },
            { id: 'v', label: 'Speed', unit: 'm/s', min: 0, max: 8000, step: 10, value: 7700 },
            { id: 'h', label: 'Height (simple m×g×h)', unit: 'km', min: 0, max: 400, step: 1, value: 400 }
          ],
          compute: (v) => {
            const ek = 0.5 * v.m * v.v * v.v;
            const ep = v.m * 9.81 * v.h * 1000;
            const tot = ek + ep;
            return [
              { label: 'Kinetic energy', value: ek / 1e9, unit: 'GJ', digits: 2 },
              { label: 'Potential energy (approx.)', value: ep / 1e9, unit: 'GJ', digits: 2 },
              { label: 'Share that is kinetic', value: tot > 0 ? (ek / tot) * 100 : 0, unit: '%', digits: 0 }
            ];
          },
          note: 'Potential energy uses a constant g, so it is a slight overestimate at large heights.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Show me the speed and altitude of a rocket reaching low Earth orbit and explain where the energy goes.',
          screen: 'analysis'
        },
        quiz: [
          {
            q: 'A spacecraft doubles its speed. Its kinetic energy becomes...',
            options: ['2 times', '4 times', '8 times', 'The same'],
            answer: 1,
            why: 'Energy is ½ m v², so doubling v gives 4 times as much.'
          },
          {
            q: 'Which takes more energy for a 400 km orbit?',
            options: ['Gaining height', 'Gaining orbital speed', 'They are equal', 'Neither needs energy'],
            answer: 1,
            why: 'Speed needs about eight times more energy than height.'
          },
          {
            q: 'What happens to a capsule\'s kinetic energy on re-entry?',
            options: ['It disappears', 'Mostly becomes heat in air and shield', 'It becomes fuel', 'It turns into mass'],
            answer: 1,
            why: 'Energy is conserved. Drag turns the speed mostly into heat.'
          }
        ],
        quick: [
          'Kinetic energy is ½ m v²: double speed, four times energy.',
          'Orbit needs far more energy for speed than height.',
          'On re-entry, that speed energy becomes heat.'
        ],
        eli15: 'In plain words: a fast bike takes far more effort to stop than a slow one, and that effort turns into heat.'
      }
    ]
  },
  {
    id: 'L3',
    n: 3,
    title: 'Rocket Fundamentals',
    icon: 'fuel',
    blurb: 'See how a rocket makes thrust, why delta-v and the rocket equation rule mission design, and how staging and a launch profile work.',
    lessons: [
      {
        id: 'L3-1',
        title: 'How a rocket works: thrust',
        minutes: 4,
        tagline: 'A rocket throws gas backward fast, and the gas pushes it forward.',
        definition: 'Thrust is the forward push from throwing propellant out fast; specific impulse (Isp) shows how well an engine uses propellant.',
        why: 'Thrust decides if a rocket leaves the pad, and Isp decides how far its propellant can take it.',
        explain: [
          'Picture throwing heavy balls backward on a skateboard. A rocket burns propellant in a chamber, and the hot gas shoots out of a bell-shaped nozzle.',
          'Thrust is about mass flow (kg of gas per second) times exhaust speed. Double either one and thrust doubles. A small extra push comes from pressure, so rockets work best in vacuum.',
          'Isp (specific impulse) is efficiency: higher is better. Typical values: solids 250 to 300 s, kerosene 300 to 360 s, hydrogen up to 450 s. Exhaust speed is ve = Isp × 9.81, so 300 s means about 2,940 m/s.'
        ],
        keyIdeas: [
          'Thrust comes from throwing mass backward fast.',
          'Thrust ≈ mass flow × exhaust speed.',
          'Isp measures propellant efficiency, in seconds.',
          'Exhaust speed = Isp × 9.81.'
        ],
        equations: [
          {
            name: 'Thrust',
            formula: 'F = ṁ × vₑ + (pₑ − p₀) × Aₑ',
            vars: [
              ['F', 'thrust', 'N'],
              ['ṁ', 'mass flow rate of propellant', 'kg/s'],
              ['vₑ', 'exhaust speed', 'm/s'],
              ['pₑ − p₀', 'nozzle-exit pressure minus outside pressure', 'Pa'],
              ['Aₑ', 'nozzle exit area', 'm²']
            ],
            meaning: 'Thrust is the momentum thrown out each second, plus a small correction for pressure.'
          },
          {
            name: 'Exhaust speed and Isp',
            formula: 'vₑ = Isp × g₀',
            vars: [
              ['vₑ', 'effective exhaust speed', 'm/s'],
              ['Isp', 'specific impulse', 's'],
              ['g₀', 'standard gravity (9.81)', 'm/s²']
            ],
            meaning: 'A higher Isp means the gas leaves faster and every kilogram of propellant pushes harder.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'An engine burns 250 kg/s with exhaust speed 3,000 m/s.\nF = 250 × 3,000 = 750,000 N = 750 kN.\nIsp = 3,000 ÷ 9.81 = about 306 s.\nBurn 500 kg/s instead and thrust doubles to 1,500 kN.'
        },
        diagram: 'thrust-drag',
        mistakes: [
          'A rocket pushes against its own exhaust, not the ground or air.',
          'Isp is not run time. It is an efficiency number that happens to be in seconds.'
        ],
        recap: 'Thrust is about mass flow times exhaust speed (F ≈ ṁ × vₑ). Isp shows efficiency, and vₑ = Isp × g₀.',
        lab: {
          title: 'Try it: thrust and Isp',
          intro: 'Pick a propellant flow and exhaust speed to get thrust and Isp.',
          inputs: [
            { id: 'mdot', label: 'Propellant flow rate', unit: 'kg/s', min: 1, max: 3000, step: 1, value: 250 },
            { id: 've', label: 'Exhaust speed', unit: 'm/s', min: 500, max: 5000, step: 10, value: 3000 }
          ],
          compute: (v) => [
            { label: 'Thrust', value: (v.mdot * v.ve) / 1000, unit: 'kN', digits: 0 },
            { label: 'Specific impulse', value: v.ve / 9.81, unit: 's', digits: 0 }
          ],
          note: 'Thrust depends on both sliders. Isp depends only on exhaust speed.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Compare a kerosene/oxygen engine and a hydrogen/oxygen engine and show their thrust and Isp.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'An engine burns 100 kg/s at 2,500 m/s exhaust speed. Thrust?',
            options: ['25 kN', '250 kN', '2,500 kN', '25,000 kN'],
            answer: 1,
            why: 'F = 100 × 2,500 = 250,000 N = 250 kN.'
          },
          {
            q: 'What does a higher Isp mean?',
            options: ['Always more thrust', 'A heavier engine', 'Better use of propellant', 'A longer burn time'],
            answer: 2,
            why: 'Isp shows how much push each kilogram of propellant gives.'
          },
          {
            q: 'Why does a rocket engine work in vacuum?',
            options: [
              'It pushes against the vacuum',
              'It pushes against its own exhaust',
              'It uses wings',
              'It needs air to burn'
            ],
            answer: 1,
            why: 'Thrust comes from throwing propellant backward, not from pushing on air.'
          }
        ],
        quick: [
          'Thrust comes from throwing gas backward fast.',
          'More gas per second or faster gas means more thrust.',
          'Isp is fuel efficiency, measured in seconds.'
        ],
        eli15: 'In plain words: stand on a skateboard and throw heavy balls backward, and you roll forward.'
      },
      {
        id: 'L3-2',
        title: 'The rocket equation and delta-v',
        minutes: 4,
        tagline: 'Speed gained depends on exhaust speed and how much mass is propellant.',
        definition: 'Delta-v (Δv, change in speed) is the total speed a rocket can gain; the rocket equation links it to exhaust speed and mass ratio.',
        why: 'Every mission needs a set Δv, like about 9.3 km/s to reach low Earth orbit. The equation tells you the propellant needed.',
        explain: [
          'Imagine a skateboard rider throwing balls. Each throw makes the rider lighter, so the next throw speeds them up more. The rocket equation adds this up.',
          'm₀ is the full (wet) mass and m_f is the empty (dry) mass. The ratio m₀ ÷ m_f is the mass ratio. The ln button (natural log) on a calculator turns it into a speed multiplier.',
          'Because of the log, extra propellant gives diminishing returns. Gravity and drag are not in the equation; they cost extra Δv. Missions add up a Δv budget and the equation gives the propellant.'
        ],
        keyIdeas: [
          'Δv is the total speed change possible.',
          'Δv = vₑ × ln(m₀ ÷ m_f).',
          'More propellant gives diminishing returns.',
          'Low Earth orbit needs about 9.3 to 10 km/s.'
        ],
        equations: [
          {
            name: 'Tsiolkovsky rocket equation',
            formula: 'Δv = vₑ × ln(m₀ ÷ m_f)',
            vars: [
              ['Δv', 'velocity change', 'm/s'],
              ['vₑ', 'effective exhaust speed', 'm/s'],
              ['m₀', 'initial (wet) mass', 'kg'],
              ['m_f', 'final (dry) mass', 'kg']
            ],
            meaning: 'A rocket gains speed depending on how fast it throws exhaust and how much of its mass it can burn away.'
          },
          {
            name: 'Solving for propellant fraction',
            formula: 'm_prop ÷ m₀ = 1 − e^(−Δv ÷ vₑ)',
            vars: [
              ['m_prop', 'propellant mass', 'kg'],
              ['m₀', 'initial mass', 'kg'],
              ['Δv', 'required velocity change', 'm/s'],
              ['vₑ', 'exhaust speed', 'm/s']
            ],
            meaning: 'This tells you what share of the starting mass must be propellant for a target Δv.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'vₑ = 3,000 m/s, start 10,000 kg, end 3,000 kg.\nMass ratio = 10,000 ÷ 3,000 = 3.33.\nln(3.33) = 1.204.\nΔv = 3,000 × 1.204 = about 3,612 m/s.\nEnd mass 1,500 kg: ratio 6.67, ln 1.897, Δv about 5,690 m/s.\nHalving the end mass added about 2,080 m/s, not double.'
        },
        diagram: 'rocket-eq',
        mistakes: [
          'Δv is not distance or speed right now. It is the total speed change available.',
          'The equation ignores gravity and drag. Those come out of the Δv budget as losses.'
        ],
        recap: 'Δv = vₑ × ln(m₀ ÷ m_f). Because of the log, big Δv needs a large share of propellant.',
        lab: {
          title: 'Try it: the rocket equation',
          intro: 'Set Isp and the two masses to see the Δv.',
          inputs: [
            { id: 'isp', label: 'Specific impulse', unit: 's', min: 100, max: 460, step: 1, value: 306 },
            { id: 'm0', label: 'Initial (wet) mass', unit: 'kg', min: 10, max: 1000000, step: 10, value: 10000 },
            { id: 'mf', label: 'Final (dry) mass', unit: 'kg', min: 1, max: 1000000, step: 10, value: 3000 }
          ],
          compute: (v) => {
            const ok = v.mf > 0 && v.m0 > v.mf;
            const ratio = v.mf > 0 ? v.m0 / v.mf : 1;
            const dv = ok ? v.isp * 9.81 * Math.log(ratio) : 0;
            return [
              { label: 'Mass ratio', value: ok ? ratio : 1, unit: '', digits: 2 },
              { label: 'Delta-v', value: dv, unit: 'm/s', digits: 0 },
              { label: 'Propellant share of start mass', value: ok ? (1 - v.mf / v.m0) * 100 : 0, unit: '%', digits: 0 }
            ];
          },
          note: 'Halve the final mass: Δv rises, but does not double. Keep final mass below initial.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build me a rocket and calculate its delta-v with the rocket equation, then compare it with what a launch to orbit needs.',
          screen: 'planner'
        },
        quiz: [
          {
            q: 'vₑ = 2,500 m/s and mass ratio e (about 2.72, ln = 1). Δv?',
            options: ['915 m/s', '2,500 m/s', '6,800 m/s', '250 m/s'],
            answer: 1,
            why: 'Δv = 2,500 × ln(e) = 2,500 × 1 = 2,500 m/s.'
          },
          {
            q: 'Why does doubling propellant not double Δv?',
            options: ['Propellant is heavy', 'Δv uses a logarithm of the ratio', 'Exhaust slows down', 'Gravity doubles'],
            answer: 1,
            why: 'ln(m₀ ÷ m_f) grows slowly, so returns shrink.'
          },
          {
            q: 'About how much Δv reaches low Earth orbit, with losses?',
            options: ['About 1 km/s', 'About 3 km/s', 'About 9.3 to 10 km/s', 'About 100 km/s'],
            answer: 2,
            why: 'Orbit needs 7.8 km/s plus about 1.5 to 2 km/s lost to gravity and drag.'
          }
        ],
        quick: [
          'Delta-v is the speed change a rocket can make.',
          'Δv = exhaust speed × ln(start mass ÷ end mass).',
          'Doubling propellant does not double Δv.'
        ],
        eli15: 'In plain words: the lighter you get while throwing balls off a skateboard, the easier each throw speeds you up.'
      },
      {
        id: 'L3-3',
        title: 'Staging and mass ratio',
        minutes: 4,
        tagline: 'Dropping empty tanks lets a rocket go faster than one stage could.',
        definition: 'Staging means a rocket built in sections that fire in turn and are dropped when empty. Mass ratio is start mass divided by end mass.',
        why: 'Carrying empty tanks wastes propellant. Dropping them is why nearly every orbital rocket uses stages.',
        explain: [
          'Climbing with a backpack of food, the pack gets lighter as you eat. But the empty bag is still on your back. Staging drops each empty bag.',
          'Each stage has its own Δv from the rocket equation, and the totals add up. An upper stage no longer carries the lower stages.',
          'More stages mean more engines and separations that can fail, so most rockets use two or three. A good stage has a structural fraction (share of structure) of only 5 to 10%.'
        ],
        keyIdeas: [
          'Staging drops empty mass.',
          'Total Δv = sum of stage Δv.',
          'More stages add cost and risk.',
          'Structure of 5 to 10% gives a good ratio.'
        ],
        equations: [
          {
            name: 'Mass ratio of a stage',
            formula: 'MR = m₀ ÷ m_f',
            vars: [
              ['MR', 'mass ratio of the stage', '(no unit)'],
              ['m₀', 'stage start mass, including everything above it', 'kg'],
              ['m_f', 'stage end mass, after burnout, still including everything above it', 'kg']
            ],
            meaning: 'The bigger the ratio, the more Δv that stage can give.'
          },
          {
            name: 'Total Δv with stages',
            formula: 'Δv_total = vₑ₁ × ln(MR₁) + vₑ₂ × ln(MR₂)',
            vars: [
              ['vₑ₁, vₑ₂', 'exhaust speed of each stage', 'm/s'],
              ['MR₁, MR₂', 'mass ratio of each stage', '(no unit)']
            ],
            meaning: 'Add up what each stage contributes.'
          }
        ],
        example: {
          title: 'Worked example',
          text: '100 t total, payload 2 t, vₑ = 3,000 m/s.\nStage 1: start 100 t, end 35 t, ratio 2.86.\nΔv1 = 3,000 × ln(2.86) = about 3,150 m/s.\nStage 2: start 20 t, end 5 t, ratio 4.\nΔv2 = 3,000 × ln(4) = about 4,160 m/s.\nTotal = about 7,300 m/s.\nOne stage, same 80 t propellant: ratio 5, about 4,830 m/s.\nStaging gains about 2,500 m/s.'
        },
        diagram: 'staging',
        mistakes: [
          'Staging does not add propellant. It removes dead weight so propellant works better.',
          'A stage\'s mass ratio counts everything above it, including upper stages and payload.'
        ],
        recap: 'Staging drops empty structure, and stage Δv values add up. It boosts performance but adds complexity.',
        lab: {
          title: 'Try it: two stages against one',
          intro: 'Set a two-stage rocket\'s masses and compare it with one stage.',
          inputs: [
            { id: 've', label: 'Exhaust speed', unit: 'm/s', min: 1500, max: 4500, step: 10, value: 3000 },
            { id: 'p1', label: 'Stage 1 propellant', unit: 't', min: 1, max: 500, step: 1, value: 65 },
            { id: 's1', label: 'Stage 1 structure', unit: 't', min: 1, max: 100, step: 1, value: 15 },
            { id: 'p2', label: 'Stage 2 propellant', unit: 't', min: 1, max: 200, step: 1, value: 15 },
            { id: 's2', label: 'Stage 2 structure', unit: 't', min: 1, max: 50, step: 1, value: 3 },
            { id: 'pl', label: 'Payload', unit: 't', min: 0.1, max: 50, step: 0.1, value: 2 }
          ],
          compute: (v) => {
            const upper0 = v.pl + v.s2 + v.p2;
            const m0 = upper0 + v.s1 + v.p1;
            const f1 = m0 - v.p1;
            const f2 = v.pl + v.s2;
            const dv1 = f1 > 0 ? v.ve * Math.log(m0 / f1) : 0;
            const dv2 = f2 > 0 ? v.ve * Math.log(upper0 / f2) : 0;
            const fs = v.pl + v.s1 + v.s2;
            const dvs = fs > 0 ? v.ve * Math.log(m0 / fs) : 0;
            const ok = (x) => (Number.isFinite(x) ? x : 0);
            return [
              { label: 'Stage 1 delta-v', value: ok(dv1), unit: 'm/s', digits: 0 },
              { label: 'Stage 2 delta-v', value: ok(dv2), unit: 'm/s', digits: 0 },
              { label: 'Two-stage total', value: ok(dv1 + dv2), unit: 'm/s', digits: 0 },
              { label: 'Single stage, same masses', value: ok(dvs), unit: 'm/s', digits: 0 }
            ];
          },
          note: 'The single stage keeps all structure, so it does worse. Try changing the upper stage.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Build me a two-stage rocket carrying a 100 kg space probe and compare it with a single-stage version.',
          screen: 'designer'
        },
        quiz: [
          {
            q: 'Why do rockets drop empty stages?',
            options: [
              'To look cool',
              'To stop carrying useless dead weight',
              'To add more thrust',
              'To lower the exhaust speed'
            ],
            answer: 1,
            why: 'The remaining propellant then pushes a lighter vehicle.'
          },
          {
            q: 'How do you find total Δv of a staged rocket?',
            options: ['Multiply the stage values', 'Take the biggest one', 'Add the Δv of each stage', 'Average them'],
            answer: 2,
            why: 'Each stage gives its own Δv, and they add up.'
          },
          {
            q: 'What is a downside of more stages?',
            options: ['Lower exhaust speed', 'More complexity, cost and risk', 'Weaker gravity', 'Less thrust in vacuum'],
            answer: 1,
            why: 'Each stage needs engines and separation, adding cost and failure points.'
          }
        ],
        quick: [
          'Empty tanks are dead weight, so drop them.',
          'Total Δv is the sum of each stage\'s Δv.',
          'More stages help but add cost and risk.'
        ],
        eli15: 'In plain words: it is like dropping each empty food bag on a hike so your pack stays light.'
      },
      {
        id: 'L3-4',
        title: 'Thrust-to-weight ratio and the launch profile',
        minutes: 4,
        tagline: 'A rocket must out-push its weight, then turn and build sideways speed.',
        definition: 'Thrust-to-weight ratio (TWR) is thrust divided by weight. The launch profile is the planned path from liftoff to orbit.',
        why: 'Below TWR 1 the rocket stays on the pad. Too high and crew feel crushing force.',
        explain: [
          'TWR compares engine push with gravity\'s pull. At 1 the rocket hovers; above 1 it rises. Launches start near 1.2 to 1.5.',
          'Burning propellant makes the rocket lighter, so TWR and g-force climb. Astronauts feel about 3 to 4 g just before engine cut-off.',
          'Path: vertical liftoff, then a gravity turn (slow tilt). Max-Q (peak air load) is at 60 to 80 s. Stages split near 2.5 minutes; orbit comes after 8 to 10.'
        ],
        keyIdeas: [
          'TWR = thrust ÷ (mass × g); needs to exceed 1.',
          'TWR and g-force rise as fuel burns.',
          'Launch events: gravity turn, max-Q, staging, orbit.',
          'Gravity and drag losses raise the Δv needed.'
        ],
        equations: [
          {
            name: 'Thrust-to-weight ratio',
            formula: 'TWR = F ÷ (m × g)',
            vars: [
              ['TWR', 'thrust-to-weight ratio', '(no unit)'],
              ['F', 'engine thrust', 'N'],
              ['m', 'current vehicle mass', 'kg'],
              ['g', 'local gravity (9.81 on Earth)', 'm/s²']
            ],
            meaning: 'A number above 1 means the engines can lift the vehicle.'
          },
          {
            name: 'Net acceleration at liftoff',
            formula: 'a = F ÷ m − g',
            vars: [
              ['a', 'upward acceleration', 'm/s²'],
              ['F', 'thrust', 'N'],
              ['m', 'mass', 'kg'],
              ['g', 'gravity', 'm/s²']
            ],
            meaning: 'The rocket accelerates by the thrust acceleration minus gravity.'
          }
        ],
        example: {
          title: 'Worked example',
          text: 'Mass 80,000 kg, thrust 1,000,000 N.\nWeight = 80,000 × 9.81 = 784,800 N.\nTWR = 1,000,000 ÷ 784,800 = about 1.27.\na = 12.5 − 9.81 = about 2.7 m/s².\nLater at 40,000 kg: a = 25 − 9.81 = about 15.2 m/s².\nThat is about 1.5 g of net acceleration.'
        },
        diagram: 'gravity-turn',
        mistakes: [
          'TWR must be clearly above 1. At exactly 1 the rocket just hovers.',
          'Rockets do not go straight up. Orbit needs mostly sideways speed.'
        ],
        recap: 'Thrust must beat weight (TWR above 1), and TWR grows as fuel burns. The launch path turns sideways to build orbital speed.',
        lab: {
          title: 'Try it: thrust-to-weight ratio',
          intro: 'Enter thrust and mass to see if it lifts off and how fast it speeds up.',
          inputs: [
            { id: 'T', label: 'Thrust', unit: 'kN', min: 10, max: 10000, step: 10, value: 1000 },
            { id: 'm', label: 'Vehicle mass', unit: 't', min: 1, max: 1000, step: 1, value: 80 }
          ],
          compute: (v) => {
            const w = v.m * 1000 * 9.81;
            const twr = w > 0 ? (v.T * 1000) / w : 0;
            const a = v.m > 0 ? (v.T * 1000) / (v.m * 1000) - 9.81 : 0;
            return [
              { label: 'Thrust-to-weight ratio', value: twr, unit: '', digits: 2 },
              { label: 'Net acceleration (0 if it stays on the pad)', value: Math.max(a, 0), unit: 'm/s²', digits: 1 },
              { label: 'Lifts off? (1 = yes, 0 = no)', value: twr > 1 ? 1 : 0, unit: '', digits: 0 }
            ];
          },
          note: 'Lower the mass to imitate burning fuel. TWR and acceleration climb.'
        },
        sim: {
          label: 'Show me in the simulator',
          ask: 'Launch a rocket with a thrust-to-weight ratio of only 1.1 and one with 1.8 and compare how each reaches orbit.',
          screen: 'simulation'
        },
        quiz: [
          {
            q: 'A rocket has TWR 0.9. What happens on the pad?',
            options: ['It lifts off slowly', 'It hovers', 'It stays on the ground', 'It flies sideways'],
            answer: 2,
            why: 'Thrust is less than weight, so it cannot lift off.'
          },
          {
            q: 'Why does acceleration rise during the burn?',
            options: [
              'Gravity gets weaker',
              'The rocket gets lighter, thrust stays similar',
              'The air gets thicker',
              'The exhaust gets slower'
            ],
            answer: 1,
            why: 'a = F ÷ m − g. Mass falls, so a rises.'
          },
          {
            q: 'Why is orbit Δv (9.3 to 10 km/s) above orbital speed (7.8)?',
            options: [
              'Orbits are elliptical',
              'Gravity and drag losses on the way up',
              'Rockets use less fuel',
              'Speed is measured wrongly'
            ],
            answer: 1,
            why: 'Climbing costs Δv to fight gravity and drag.'
          }
        ],
        quick: [
          'TWR must be above 1 to lift off.',
          'The rocket gets lighter, so acceleration rises.',
          'It tilts over to gain sideways speed for orbit.'
        ],
        eli15: 'In plain words: lifting a heavy box only works if you push up harder than it weighs.'
      }
    ]
  }
];
