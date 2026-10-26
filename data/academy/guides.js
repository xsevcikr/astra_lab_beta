// Build guides: short step-by-step "How to build ..." recipes for the Academy. One guide per ready-made vehicle of data/templates.js.
// Every step has:  do    = ONE short sentence,
//                  kinds = component kinds whose "what it does" line is shown under the step (text from COMPONENT_INFO),
//                  check = tells by itself when app.project shows the step is done (see CHECKS in ui/lib/guideactions.js),
//                  action = a button. It really edits the project through the same tool API as the AI Helper (so Undo works):
//     {label, tool:'CREATE_STAGE', args:{...}}   run an editing tool        {label, fn:'name'}  a helper of ui/lib/guideactions.js
//     {label, go:'screen', params}               open a screen               {label, lesson:'L3-4'}  open a lesson
//     {label, ai:'text'}                         send text to the AI Helper  {label, example:'template-id'}  load the finished vehicle
// `example` = id of the finished vehicle in data/templates.js. `exampleNote` says honestly what tests/guides.test.js flew in the real simulator.
// tests/guides.test.js performs every tool step of every guide, then flies the result for the guides that make a claim.

const ENGINE_STEP = (id, args, label = 'Add the engine and tanks') => ({ id, do: args.do, kinds: ['engine', 'fuel_tank', 'oxidizer_tank'], check: args.check, action: { label, tool: 'CREATE_STAGE', args: args.stage } });
const mission = (id, doText, args, check = 'mission', label = 'Create the mission') => ({ id, do: doText, what: 'The goal. It tells the simulator what success is.', check, action: { label, tool: 'CREATE_MISSION', args } });
const LAUNCH = { id: 'launch', do: 'Launch it and watch the flight.', what: 'Real physics flies your rocket. Nothing is faked.', check: 'run', action: { label: 'Launch now', go: 'control', params: { autostart: true } } };
const RESULT = (text) => ({ id: 'result', do: text, what: 'It shows what happened and why.', check: 'success', action: { label: 'Open the analysis', go: 'analysis' } });
const TWR = { id: 'twr', do: 'Check the engine pushes harder than the weight.', what: 'Push over weight is TWR. Below 1, it stays put.', check: null, action: { label: 'Learn: thrust-to-weight', lesson: 'L3-4' } };

export const GUIDES = [
  {
    id: 'sounding-rocket', icon: 'rocket', title: 'How to build a sounding rocket',
    goal: 'Fly one stage straight up above 100 km, the edge of space.', difficulty: 'Easy', minutes: 8,
    needs: ['engine', 'fuel_tank', 'oxidizer_tank', 'fairing', 'payload'],
    example: 'sounding-rocket', exampleNote: 'Flown in the simulator: climbs above 100 km.',
    steps: [
      { id: 'body', do: 'Start a new rocket, 0.6 m wide.', what: 'The empty rocket. Parts go on it.', check: 'vehicle:Sounding rocket', action: { label: 'Start the rocket', tool: 'CREATE_VEHICLE', args: { type: 'rocket', name: 'Sounding rocket', diameter: 0.6 } } },
      ENGINE_STEP('stage', { do: 'Add one engine and 600 kg of fuel.', check: 'stage:1', stage: { vehicle: 'Sounding rocket', engine: 'eng-al25s', engineCount: 1, propellantMass: 600, diameter: 0.6, name: 'Rocket' } }),
      TWR,
      { id: 'payload', do: 'Put a 300 kg experiment in the nose.', kinds: ['payload', 'fairing', 'nose_cone'], check: 'payload', action: { label: 'Add the experiment', fn: 'soundingPayload' } },
      { id: 'mission', do: 'Set the goal: fly above 100 km.', what: 'The goal. It tells the simulator what success is.', check: 'mission', action: { label: 'Set the 100 km goal', fn: 'soundingMission' } },
      LAUNCH,
      RESULT('Did it pass 100 km? Read the result.'),
    ],
  },
  {
    id: 'small-launcher', icon: 'satellite', title: 'How to build a small satellite launcher',
    goal: 'Put a 100 kg probe into a circle 200 km above the Earth.', difficulty: 'Medium', minutes: 12,
    needs: ['engine', 'fuel_tank', 'oxidizer_tank', 'interstage', 'fairing', 'payload'],
    example: 'small-launcher', exampleNote: 'Flown in the simulator: reaches a 200 km orbit.',
    steps: [
      { id: 'body', do: 'Start a new rocket, 1.19 m wide.', what: 'The empty rocket. Parts go on it.', check: 'vehicle:Small launcher', action: { label: 'Start the rocket', tool: 'CREATE_VEHICLE', args: { type: 'rocket', name: 'Small launcher', diameter: 1.19 } } },
      ENGINE_STEP('stage1', { do: 'Build stage 1: six engines, 6.7 t of fuel.', check: 'stage:1', stage: { vehicle: 'Small launcher', order: 1, engine: 'eng-al25s', engineCount: 6, propellantMass: 6741, diameter: 1.19 } }, 'Add stage 1'),
      ENGINE_STEP('stage2', { do: 'Build stage 2: one space engine.', check: 'stage:2', stage: { vehicle: 'Small launcher', order: 2, engine: 'eng-al25v', engineCount: 1, propellantMass: 1578, diameter: 1.19 } }, 'Add stage 2'),
      { id: 'why2', do: 'Learn why two stages beat one.', what: 'Dropping empty weight makes the rest go faster.', kinds: ['interstage'], check: null, action: { label: 'Learn: staging', lesson: 'L3-3' } },
      { id: 'probe', do: 'Build a 100 kg space probe.', kinds: ['payload', 'solar_panel', 'antenna'], check: 'vehicle:Space probe', action: { label: 'Build the probe', tool: 'CREATE_PROBE', args: { name: 'Space probe', mass: 100 } } },
      { id: 'load', do: 'Put the probe under the fairing.', kinds: ['fairing'], check: 'payload', action: { label: 'Load the probe', tool: 'ADD_PAYLOAD', args: { vehicle: 'Small launcher', payloadVehicle: 'Space probe' } } },
      mission('mission', 'Set the goal: a 200 km orbit.', { vehicle: 'Small launcher', kind: 'launch', altitude: 200000 }),
      LAUNCH,
      RESULT('Is it in orbit? Check the result.'),
    ],
  },
  {
    id: 'medium-launcher', icon: 'rocket', title: 'How to build a bigger launcher',
    goal: 'Carry a 500 kg satellite to a 400 km orbit, where the space station flies.', difficulty: 'Hard', minutes: 15,
    needs: ['engine', 'fuel_tank', 'oxidizer_tank', 'interstage', 'fairing', 'payload'],
    example: 'medium-launcher', exampleNote: 'Flown in the simulator: reaches a 400 km orbit with 500 kg.',
    steps: [
      { id: 'budget', do: 'Learn why heavy cargo needs a bigger rocket.', what: 'Extra weight needs fuel, and that fuel needs more fuel.', check: null, action: { label: 'Learn: the rocket equation', lesson: 'L3-2' } },
      { id: 'body', do: 'Start a new rocket, 1.65 m wide.', what: 'A wider rocket holds more fuel.', check: 'vehicle:Medium launcher', action: { label: 'Start the rocket', tool: 'CREATE_VEHICLE', args: { type: 'rocket', name: 'Medium launcher', diameter: 1.65 } } },
      ENGINE_STEP('stage1', { do: 'Build stage 1: four engines, 16 t of fuel.', check: 'stage:1', stage: { vehicle: 'Medium launcher', order: 1, engine: 'eng-al100', engineCount: 4, propellantMass: 16128, diameter: 1.65 } }, 'Add stage 1'),
      ENGINE_STEP('stage2', { do: 'Build stage 2: two space engines.', check: 'stage:2', stage: { vehicle: 'Medium launcher', order: 2, engine: 'eng-al25v', engineCount: 2, propellantMass: 3916, diameter: 1.65 } }, 'Add stage 2'),
      { id: 'probe', do: 'Build the 500 kg satellite.', kinds: ['payload', 'battery'], check: 'vehicle:Satellite payload', action: { label: 'Build the payload', tool: 'CREATE_PROBE', args: { name: 'Satellite payload', mass: 500 } } },
      { id: 'load', do: 'Put it under the fairing.', kinds: ['fairing'], check: 'payload', action: { label: 'Load the payload', tool: 'ADD_PAYLOAD', args: { vehicle: 'Medium launcher', payloadVehicle: 'Satellite payload' } } },
      mission('mission', 'Set the goal: a 400 km orbit.', { vehicle: 'Medium launcher', kind: 'launch', altitude: 400000 }),
      { id: 'path', do: 'Tilt the climb so it bends over sooner.', what: 'Heavy rockets climb slowly. A gentler turn saves fuel.', check: null, action: { label: 'Shape the climb', tool: 'MODIFY_MISSION', args: { schedule: { hF: 100000, n: 0.65 } } } },
      LAUNCH,
      RESULT('Check the result. If it failed, fix the named part.'),
    ],
  },
  {
    id: 'space-probe', icon: 'probe', title: 'How to build a space probe',
    goal: 'A probe that makes power, talks to Earth and runs its instruments.', difficulty: 'Easy', minutes: 8,
    needs: ['solar_panel', 'battery', 'antenna', 'instrument', 'radiator', 'computer'],
    example: 'space-probe', exampleNote: 'Flown in the simulator: survives 90 minutes in orbit with power and radio working.',
    steps: [
      { id: 'build', do: 'Create a 100 kg probe.', kinds: ['payload', 'solar_panel', 'battery', 'antenna', 'instrument', 'computer'], check: 'vehicle:Space probe', action: { label: 'Build the probe', tool: 'CREATE_PROBE', args: { name: 'Space probe', mass: 100, destination: 'mars' } } },
      { id: 'heat', do: 'Add a radiator to shed extra heat.', kinds: ['radiator'], check: 'kind:radiator', action: { label: 'Add a radiator', tool: 'ADD_COMPONENT', args: { vehicle: 'Space probe', catalogId: 'thermal-radiator', mount: 'radial', properties: { name: 'Extra radiator' } } } },
      mission('mission', 'Set the goal: survive 90 minutes in orbit.', { vehicle: 'Space probe', kind: 'probe_operations', inclination: 40, altitude: 500000 }),
      LAUNCH,
      RESULT('Did it survive? Check power, heat, radio.'),
    ],
  },
  {
    id: 'satellite', icon: 'satellite', title: 'How to build a small satellite',
    goal: 'A satellite that opens its solar panels, stays warm and talks to Earth.', difficulty: 'Easy', minutes: 8,
    needs: ['solar_panel', 'antenna', 'reaction_wheel', 'battery', 'radiator'],
    example: 'satellite', exampleNote: 'Flown in the simulator: survives 90 minutes in orbit with power and radio working.',
    steps: [
      { id: 'build', do: 'Create a 250 kg satellite.', kinds: ['solar_panel', 'battery', 'antenna', 'reaction_wheel'], check: 'vehicle:Satellite', action: { label: 'Build the satellite', tool: 'CREATE_VEHICLE', args: { type: 'satellite', name: 'Satellite', mass: 250, dv: 300 } } },
      { id: 'heat', do: 'Add a radiator to shed extra heat.', kinds: ['radiator'], check: 'kind:radiator', action: { label: 'Add a radiator', tool: 'ADD_COMPONENT', args: { vehicle: 'Satellite', catalogId: 'thermal-radiator', mount: 'radial', properties: { name: 'Extra radiator' } } } },
      mission('mission', 'Set the goal: survive 90 minutes in orbit.', { vehicle: 'Satellite', kind: 'probe_operations', inclination: 40, altitude: 500000 }),
      LAUNCH,
      RESULT('Did it survive? Check power, heat, radio.'),
    ],
  },
  {
    id: 'moon-lander', icon: 'moon', title: 'How to build a Moon lander',
    goal: 'Slow down with an engine and land softly on four legs.', difficulty: 'Medium', minutes: 10,
    needs: ['engine', 'landing_legs', 'guidance', 'rcs', 'fuel_tank'],
    example: 'moon-lander', exampleNote: 'Flown in the simulator: lands softly on the Moon.',
    steps: [
      { id: 'why', do: 'Learn why the Moon needs landing engines.', what: 'No air on the Moon, so no parachute.', check: null, action: { label: 'Learn: landing', lesson: 'L8-4' } },
      { id: 'build', do: 'Create a Moon lander for 150 kg cargo.', kinds: ['engine', 'landing_legs', 'guidance', 'rcs'], check: 'vehicle:Moon lander', action: { label: 'Build the lander', tool: 'CREATE_LANDER', args: { name: 'Moon lander', body: 'moon', payloadMass: 150 } } },
      mission('mission', 'Set the goal: land softly.', { vehicle: 'Moon lander', kind: 'landing' }),
      LAUNCH,
      RESULT('Did it land softly? Check the speed.'),
    ],
  },
  {
    id: 'lander-with-rover', icon: 'lander', title: 'How to build a lander that carries a rover',
    goal: 'Land on the Moon and drop a small rover.', difficulty: 'Hard', minutes: 12,
    needs: ['engine', 'landing_legs', 'rover_chassis', 'wheel'],
    example: 'lander-with-rover', exampleNote: 'Flown in the simulator: the lander touches down softly with the rover aboard.',
    steps: [
      { id: 'rover', do: 'Build a 120 kg rover first.', kinds: ['rover_chassis', 'wheel', 'motor'], check: 'vehicle:Rover', action: { label: 'Build the rover', tool: 'CREATE_ROVER', args: { name: 'Rover', mass: 120 } } },
      { id: 'lander', do: 'Build a lander that carries the rover.', kinds: ['engine', 'landing_legs'], check: 'vehicle:Moon lander with rover', action: { label: 'Build the lander', tool: 'CREATE_LANDER', args: { name: 'Moon lander with rover', body: 'moon', carryRover: 'Rover' } } },
      mission('mission', 'Set the goal: land softly.', { vehicle: 'Moon lander with rover', kind: 'landing', name: 'Moon landing and rover deployment' }),
      LAUNCH,
      RESULT('Did it land? Then the rover drives off.'),
    ],
  },
  {
    id: 'moon-rocket-apollo', icon: 'moon', title: 'How to build an Apollo 11 Moon rocket',
    goal: 'Fly a Saturn V-style rocket to the Moon, land, lift off, dock and head home.', difficulty: 'Hard', minutes: 20,
    needs: ['engine', 'fuel_tank', 'oxidizer_tank', 'interstage', 'fairing', 'landing_legs', 'rcs'],
    example: 'moon-rocket-apollo', exampleNote: 'Flown in the simulator: about 8.5 days from liftoff to splashdown. Docking is scripted and the crew is mass only.',
    steps: [
      { id: 'why', do: 'Learn how a ship gets from Earth orbit to the Moon.', what: 'A big burn in orbit throws the ship toward the Moon.', check: null, action: { label: 'Learn: changing orbits', lesson: 'L7-3' } },
      { id: 'orbit', do: 'Learn what a parking orbit is.', what: 'The ship waits in a round orbit for about two hours, then fires toward the Moon.', check: null, action: { label: 'Learn: orbits', lesson: 'L7-2' } },
      { id: 'build', do: 'Build the three-stage Saturn V stack.', what: 'Stage 1, 2 and 3 with the escape tower, the command and service module and the lunar module in its adapter.', kinds: ['engine', 'interstage', 'fairing', 'landing_legs', 'rcs'], check: 'vehicle:Saturn V', action: { label: 'Build the rocket', tool: 'CREATE_APOLLO_ROCKET', args: { name: 'Saturn V' } } },
      { id: 'mission', do: 'Plan the Apollo mission.', what: 'The planner flies the ascent once, then picks the launch time and burns.', check: 'mission', action: { label: 'Plan the Moon mission', tool: 'CREATE_MISSION', args: { vehicle: 'Saturn V', kind: 'apollo', name: 'Apollo 11-style mission' } } },
      { id: 'launch', do: 'Launch it. Time warp slows down by itself.', what: 'The mission takes about eight days. Use high warp in the coast.', check: 'run', action: { label: 'Launch now', go: 'control', params: { autostart: true } } },
      RESULT('Did it land softly and come home? Read the result.'),
    ],
  },
  {
    id: 'moon-rocket-rover', icon: 'moon', title: 'How to build a rocket that takes a rover to the Moon',
    goal: 'Send a 3-stage rocket to the Moon and land a lander with a rover.', difficulty: 'Hard', minutes: 20,
    needs: ['engine', 'fuel_tank', 'oxidizer_tank', 'interstage', 'fairing', 'landing_legs', 'rcs', 'solar_panel'],
    example: 'moon-rocket-rover', exampleNote: 'Flown in the simulator: about 5 days to a soft Moon landing with the rover aboard. No return trip.',
    steps: [
      { id: 'why', do: 'Learn how a ship gets from Earth orbit to the Moon.', what: 'A big burn in orbit throws the ship toward the Moon.', check: null, action: { label: 'Learn: changing orbits', lesson: 'L7-3' } },
      { id: 'body', do: 'Start a new rocket, 5 m wide.', what: 'The empty rocket. Parts go on it.', check: 'vehicle:Moon rocket', action: { label: 'Start the rocket', tool: 'CREATE_VEHICLE', args: { type: 'rocket', name: 'Moon rocket', diameter: 5 } } },
      ENGINE_STEP('stage1', { do: 'Stage 1: four big engines, 330 t of fuel.', check: 'stage:1', stage: { vehicle: 'Moon rocket', order: 1, engine: 'eng-al2000', engineCount: 4, propellantMass: 330000, diameter: 5, name: 'Stage 1' } }, 'Add stage 1'),
      ENGINE_STEP('stage2', { do: 'Stage 2: three vacuum engines, 75 t of fuel.', check: 'stage:2', stage: { vehicle: 'Moon rocket', order: 2, engine: 'eng-al500v', engineCount: 3, propellantMass: 75000, diameter: 5, name: 'Stage 2' } }, 'Add stage 2'),
      ENGINE_STEP('stage3', { do: 'Stage 3: three hydrogen engines, 26 t of fuel.', check: 'stage:3', stage: { vehicle: 'Moon rocket', order: 3, engine: 'eng-al110h', engineCount: 3, propellantMass: 26000, diameter: 5, name: 'Stage 3' } }, 'Add stage 3'),
      { id: 'rover', do: 'Build a 120 kg rover first.', kinds: ['rover_chassis', 'wheel', 'motor'], check: 'vehicle:Rover', action: { label: 'Build the rover', tool: 'CREATE_ROVER', args: { name: 'Rover', mass: 120 } } },
      { id: 'lander', do: 'Build a lander that carries the rover.', kinds: ['engine', 'landing_legs', 'rcs'], check: 'vehicle:Moon lander', action: { label: 'Build the lander', tool: 'CREATE_LANDER', args: { name: 'Moon lander', body: 'moon', carryRover: 'Rover', forMoonRocket: true } } },
      { id: 'service', do: 'Build the service module for course changes and braking.', kinds: ['engine', 'solar_panel', 'battery', 'radiator'], check: 'vehicle:Service module', action: { label: 'Build the service module', tool: 'CREATE_SERVICE_MODULE', args: { name: 'Service module', lander: 'Moon lander', dv: 1150 } } },
      { id: 'load', do: 'Put both under the fairing.', what: 'The service module goes below, the lander on top.', kinds: ['fairing'], check: 'moonship', action: { label: 'Load the Moon ship', tool: 'ADD_PAYLOAD', args: { vehicle: 'Moon rocket', serviceModule: 'Service module', lander: 'Moon lander' } } },
      { id: 'mission', do: 'Set the goal: land on the Moon.', what: 'The planner picks the launch time and burn times by real physics.', check: 'mission', action: { label: 'Plan the Moon landing', tool: 'CREATE_MISSION', args: { vehicle: 'Moon rocket', kind: 'moon', name: 'Moon landing' } } },
      { id: 'launch', do: 'Launch it, then use high time warp.', what: 'The trip takes about 5 days. Warp to 10000× or more.', check: 'run', action: { label: 'Launch now', go: 'control', params: { autostart: true } } },
      RESULT('Did it land softly? Read the result.'),
    ],
  },
  {
    id: 'moon-rocket-module', icon: 'moon', title: 'How to build an Apollo-style rocket for a lunar module',
    goal: 'Send a 3-stage rocket to the Moon and land a lunar module, like Apollo 11.', difficulty: 'Hard', minutes: 19,
    needs: ['engine', 'fuel_tank', 'oxidizer_tank', 'interstage', 'fairing', 'landing_legs', 'rcs', 'solar_panel'],
    example: 'moon-rocket-module', exampleNote: 'Flown in the simulator: about 5 days to a soft Moon landing. The cabin is mass only; no return trip.',
    steps: [
      { id: 'why', do: 'Learn how a ship gets from Earth orbit to the Moon.', what: 'A big burn in orbit throws the ship toward the Moon.', check: null, action: { label: 'Learn: changing orbits', lesson: 'L7-3' } },
      { id: 'body', do: 'Start a new rocket, 5 m wide.', what: 'The empty rocket. Parts go on it.', check: 'vehicle:Moon rocket', action: { label: 'Start the rocket', tool: 'CREATE_VEHICLE', args: { type: 'rocket', name: 'Moon rocket', diameter: 5 } } },
      ENGINE_STEP('stage1', { do: 'Stage 1: four big engines, 330 t of fuel.', check: 'stage:1', stage: { vehicle: 'Moon rocket', order: 1, engine: 'eng-al2000', engineCount: 4, propellantMass: 330000, diameter: 5, name: 'Stage 1' } }, 'Add stage 1'),
      ENGINE_STEP('stage2', { do: 'Stage 2: three vacuum engines, 75 t of fuel.', check: 'stage:2', stage: { vehicle: 'Moon rocket', order: 2, engine: 'eng-al500v', engineCount: 3, propellantMass: 75000, diameter: 5, name: 'Stage 2' } }, 'Add stage 2'),
      ENGINE_STEP('stage3', { do: 'Stage 3: three hydrogen engines, 26 t of fuel.', check: 'stage:3', stage: { vehicle: 'Moon rocket', order: 3, engine: 'eng-al110h', engineCount: 3, propellantMass: 26000, diameter: 5, name: 'Stage 3' } }, 'Add stage 3'),
      { id: 'lander', do: 'Build a lunar module with a 1200 kg crew cabin.', what: 'Only the cabin mass is simulated. Crew and air are not.', kinds: ['engine', 'landing_legs', 'rcs'], check: 'vehicle:Lunar module', action: { label: 'Build the lunar module', tool: 'CREATE_LANDER', args: { name: 'Lunar module', body: 'moon', cabinMass: 1200, forMoonRocket: true } } },
      { id: 'service', do: 'Build the service module for course changes and braking.', kinds: ['engine', 'solar_panel', 'battery', 'radiator'], check: 'vehicle:Service module', action: { label: 'Build the service module', tool: 'CREATE_SERVICE_MODULE', args: { name: 'Service module', lander: 'Lunar module', dv: 1150 } } },
      { id: 'load', do: 'Put both under the fairing.', what: 'The service module goes below, the lander on top.', kinds: ['fairing'], check: 'moonship', action: { label: 'Load the Moon ship', tool: 'ADD_PAYLOAD', args: { vehicle: 'Moon rocket', serviceModule: 'Service module', lander: 'Lunar module' } } },
      { id: 'mission', do: 'Set the goal: land on the Moon.', what: 'The planner picks the launch time and burn times by real physics.', check: 'mission', action: { label: 'Plan the Moon landing', tool: 'CREATE_MISSION', args: { vehicle: 'Moon rocket', kind: 'moon', name: 'Moon landing' } } },
      { id: 'launch', do: 'Launch it, then use high time warp.', what: 'The trip takes about 5 days. Warp to 10000× or more.', check: 'run', action: { label: 'Launch now', go: 'control', params: { autostart: true } } },
      RESULT('Did it land softly? Read the result.'),
    ],
  },
  {
    id: 'rover', icon: 'rover', title: 'How to build a rover',
    goal: 'Drive 200 m on the Moon with six wheels, a battery and a solar panel.', difficulty: 'Easy', minutes: 8,
    needs: ['rover_chassis', 'wheel', 'motor', 'solar_panel', 'battery'],
    example: 'rover', exampleNote: 'Flown in the simulator: drives 200 m on the Moon.',
    steps: [
      { id: 'build', do: 'Create a 150 kg rover.', kinds: ['rover_chassis', 'wheel', 'motor', 'battery', 'solar_panel'], check: 'vehicle:Rover', action: { label: 'Build the rover', tool: 'CREATE_ROVER', args: { name: 'Rover', mass: 150 } } },
      mission('mission', 'Set the goal: drive 200 m.', { vehicle: 'Rover', kind: 'rover', body: 'moon', distance: 200, name: 'Moon rover drive (200 m)' }),
      LAUNCH,
      RESULT('How far did it drive? Check the battery.'),
    ],
  },
  {
    id: 'fix-failure', icon: 'tools', title: 'How to fix a rocket that fails',
    goal: 'Find out why a rocket failed and fix it, step by step.', difficulty: 'Medium', minutes: 10,
    needs: ['engine', 'fuel_tank', 'oxidizer_tank', 'interstage'],
    example: null, exampleNote: null,
    steps: [
      { id: 'broken', do: 'Load a rocket with half a fuel tank.', what: 'Engineers learn from failures. This one fails on purpose.', check: 'vehicle', action: { label: 'Load the broken rocket', fn: 'brokenRocket' } },
      { id: 'test', do: 'Fly it.', what: 'You need a failure to study.', check: 'run', action: { label: 'Test it', ai: 'Test it.' } },
      { id: 'why', do: 'Ask why it failed.', what: 'The answer comes from real numbers.', check: null, action: { label: 'Why did it fail?', ai: 'Why did it fail?' } },
      { id: 'fix', do: 'Ask for a fix and approve it.', what: 'Change one thing at a time.', check: null, action: { label: 'Fix it', ai: 'Fix it.' } },
      { id: 'retest', do: 'Fly it again.', what: 'Only a new test proves a fix.', check: 'success', action: { label: 'Test it again', ai: 'Test it.' } },
    ],
  },
];

export const guideById = (id) => GUIDES.find((g) => g.id === id) ?? null;
/** Guide that matches a ready-made vehicle (template id). */
export const guideForTemplate = (templateId) => GUIDES.find((g) => g.example === templateId) ?? null;
/** Every phrase that a guide sends to the AI Helper (used by tests to make sure the offline engineer understands them). */
export const guidePrompts = () => GUIDES.flatMap((g) => g.steps.filter((s) => s.action?.ai).map((s) => ({ guide: g.id, step: s.id, text: s.action.ai })));
