// Beginner text of every lesson: 3 short paragraphs, one idea each, sentences of 12 words or fewer.
// data/academy/index.js shows this as the main text. The original technical text stays on the lesson as `deep` ("Go deeper").
export const SIMPLE = {
  'L1-1': [
    'Aerospace engineers design things that fly. Planes, rockets and satellites all count.',
    'A rocket must be strong, but also light. Engineers pick the best mix.',
    'Teams of specialists share the work. Then they test everything before launch.',
  ],
  'L1-2': [
    'Air is like a pile of blankets. The bottom is squashed. The top is fluffy.',
    'The air gets thinner as you climb. Space has no sharp edge. We say it starts at 100 km.',
    'Gravity is still strong up there. Astronauts float because they are falling around Earth.',
  ],
  'L1-3': [
    'A jet engine breathes air. A rocket carries its own oxygen, like a diver with a tank.',
    'Wings need air to make lift. A rocket just throws hot gas backward.',
    'That is why rockets work in space. The cost is weight. Most of a rocket is fuel.',
  ],
  'L1-4': [
    'A rocket is a team of parts. The structure is the frame. Tanks and engines push it.',
    'Electronics and guidance steer the rocket. Stages drop away when they are empty.',
    'The payload is the cargo on top. Every other part exists to deliver it.',
  ],
  'L2-1': [
    'Mass is how much stuff you are made of. It never changes.',
    'Weight is how hard gravity pulls on you. On the Moon you weigh one sixth.',
    'Gravity gets weaker with distance. Far from Earth, the pull is small but never zero.',
  ],
  'L2-2': [
    'A force is a push or a pull. It changes how something moves.',
    'A heavy object needs a bigger push. A full shopping cart is harder to speed up.',
    'A rocket pushes gas down. The gas pushes the rocket up. Both pushes are equal.',
  ],
  'L2-3': [
    'Speed is how fast. Velocity is how fast and in which direction.',
    'Acceleration is how quickly velocity changes. A launch can press you into your seat.',
    'Momentum is mass times velocity. The exhaust goes back, so the rocket goes forward.',
  ],
  'L2-4': [
    'Moving things have energy. Double the speed and the energy is four times bigger.',
    'Lifted things have stored energy too, like a ball on a shelf.',
    'Energy never disappears. It only changes form. Coming back, speed turns into heat.',
  ],
  'L3-1': [
    'Imagine throwing heavy balls backward on a skateboard. You would roll forward.',
    'A rocket does the same with hot gas. The push on the rocket is called thrust.',
    'Faster gas gives more push for the same fuel. Isp tells you how efficient it is.',
  ],
  'L3-2': [
    'Delta-v is your rocket\'s speed budget. It tells you how much speed you can add.',
    'Burning fuel makes the rocket lighter. So each bit of fuel works harder.',
    'But more fuel gives less and less extra speed. Missions add up a delta-v budget.',
  ],
  'L3-3': [
    'Stages are rocket sections. When one runs empty, it drops off.',
    'The rest is lighter, so the next engine speeds it up more.',
    'Two or three stages is usual. More stages means more parts that can fail.',
  ],
  'L3-4': [
    'Thrust-to-weight compares the engine push with the rocket weight.',
    'Below 1, the rocket stays on the pad. Above 1, it lifts off.',
    'Burning fuel makes the rocket lighter. So it speeds up more and more.',
  ],
  'L4-1': [
    'A rocket engine is like a strong campfire in a metal cup. The hot gas rushes out.',
    'Rockets carry their own oxygen. That lets them work in space.',
    'Isp tells you how well the fuel is used. Hydrogen gives the best Isp.',
  ],
  'L4-2': [
    'The nozzle is the bell at the back. It turns hot gas into fast gas.',
    'Squeeze a hose and the water shoots out faster. The narrow throat does that.',
    'Low rockets use short bells. Upper stages use huge bells for thin air.',
  ],
  'L4-3': [
    'A solid rocket is one block of fuel. Once lit, it is hard to stop.',
    'A liquid rocket has pipes and pumps. It can throttle, stop and restart.',
    'Solids are simple and strong. Liquids are more efficient and easier to control.',
  ],
  'L4-4': [
    'An ion engine uses electricity to shoot out tiny charged atoms.',
    'Its push is very weak, like two sheets of paper. It cannot lift off Earth.',
    'In space it pushes for months. It uses very little fuel. It needs big solar panels.',
  ],
  'L5-1': [
    'Air pressure is the weight of all the air above you.',
    'It halves about every 5.5 km. At 30 km, only 1% is left.',
    'A rocket leaves the thick air in a minute or two. Then drag nearly vanishes.',
  ],
  'L5-2': [
    'Put your hand out of a car window. Faster means a harder push. That is drag.',
    'Double the speed and drag is four times bigger.',
    'A rocket speeds up, but the air thins. The peak push is called Max-Q.',
  ],
  'L5-3': [
    'A dart has a heavy tip and feathers behind. It flies straight.',
    'A rocket is stable when the air pushes behind its heavy point.',
    'Fins help the tail. Pointed noses cut air best. Capsules use blunt shapes.',
  ],
  'L5-4': [
    'Mach 1 is the speed of sound. Near it, air piles up and drag jumps.',
    'A capsule coming home flies at about Mach 25. All that speed turns into heat.',
    'Most heat comes from squashed air, not rubbing. A heat shield protects the capsule.',
  ],
  'L6-1': [
    'To reach orbit you must go sideways, not only up. About 7.8 km/s sideways.',
    'The rocket rises and tilts over. It drops its first stage. Then it speeds up sideways.',
    'A short burn at the top makes the orbit round. Losses make the real cost higher.',
  ],
  'L6-2': [
    'Toss a ball up with a slight lean. Gravity bends its path into an arc.',
    'A rocket does this too. It gets a small kick, then follows its own path.',
    'This saves fuel and keeps the sideways air push small.',
  ],
  'L6-3': [
    'Orbit needs 7.8 km/s. But rockets need about 9.4 km/s in total.',
    'The extra pays for losses. Gravity takes the most. Drag and steering take some.',
    'Earth spins east. Launching east near the equator gives a free boost.',
  ],
  'L6-4': [
    'Angle of attack: the gap between nose and flight path.',
    'Keep it small while the air is thick. A big angle pushes the rocket sideways.',
    'Pitch is nodding. Yaw is shaking your head. Roll is spinning. Engines swivel to steer.',
  ],
  'L7-1': [
    'Throw a ball very hard from a mountain. The ground curves away as it falls.',
    'Fast enough and it never lands. That is an orbit. A fall that keeps missing.',
    'The space station circles Earth in about 90 minutes. Higher orbits are slower.',
  ],
  'L7-2': [
    'Most orbits are ovals, not circles. Close is called periapsis. Far is apoapsis.',
    'On a roller coaster you are fastest at the bottom.',
    'The size of the oval sets the time for one lap.',
  ],
  'L7-3': [
    'In space you cannot just steer somewhere. Every burn costs delta-v.',
    'To go higher, burn forward at the low point. Coast to the top. Burn again.',
    'Two burns is a Hohmann transfer. It uses the least fuel.',
  ],
  'L7-4': [
    'Escape speed is about 1.4 times orbital speed. From Earth it is 11.2 km/s.',
    'A trip to Mars takes 8 to 9 months. Good dates come every 26 months.',
    'Orbits have jobs. Low ones for photos. Geostationary ones for TV. Polar ones scan Earth.',
  ],
  'L8-1': [
    'A spacecraft is like a tiny city. It has power, heating, radio and a brain.',
    'It also has engines, a frame and the payload. The payload is the reason it flies.',
    'Launch is the hardest test. It shakes a lot, so the frame must be strong and light.',
  ],
  'L8-2': [
    'Solar panels make power. Batteries store it for when the Sun is hidden.',
    'Far from the Sun there is less light. Far probes may use a nuclear power source.',
    'Space has no air. Heat can only leave by glowing away. Radiators and blankets help.',
  ],
  'L8-3': [
    'Spacecraft talk by radio. Radio is fast, but not instant.',
    'The Moon is 1.3 seconds away. Mars is 3 to 22 minutes away.',
    'So you cannot steer far robots with a joystick. They drive themselves.',
  ],
  'L8-4': [
    'A craft in orbit has huge energy. To land, that energy must go somewhere.',
    'In air, a heat shield and parachute carry it away. On the Moon, only rockets work.',
    'Mars air is thin. Landers use a shield, a parachute and then rockets.',
  ],
  'L9-1': [
    'GNC answers three questions. Where am I? Where to? How do I steer?',
    'Sensors tell the computer where it is. A spin sensor drifts a little over time.',
    'Star trackers and GPS fix the drift. The computer blends all of them.',
  ],
  'L9-2': [
    'Think of a shower. Too cold? Turn the hot tap up. Too hot? Turn it down.',
    'Feedback control does this many times a second. It measures error and corrects it.',
    'Too weak is lazy. Too strong wobbles. Good tuning is fast and calm.',
  ],
  'L9-3': [
    'To turn a rocket, tilt the engine. The push then twists the rocket.',
    'Satellites use spinning wheels. Speed one up and the satellite turns the other way.',
    'Wheels use no fuel. When they spin too fast, small thrusters slow them down.',
  ],
  'L9-4': [
    'Guidance picks the path. A fixed plan cannot handle surprises.',
    'Better guidance recalculates the path during flight.',
    'A filter mixes predictions with noisy sensor readings. The result is a better guess.',
  ],
  'L10-1': [
    'Every mission starts with one goal, written in one sentence.',
    'From the goal you work out a delta-v budget. Add a safety margin of 5 to 15%.',
    'Planets move. Cheap trips to Mars are only possible every 26 months.',
  ],
  'L10-2': [
    'A mass budget lists the weight of every part. It is like packing a suitcase.',
    'Early guesses are always too low. Teams add a margin of 20 to 30%.',
    'One extra kilogram of dry weight needs several kilograms of fuel. So every gram counts.',
  ],
  'L10-3': [
    'A timeline is a script from launch to landing. Each step has a plan B.',
    'Teams list what could go wrong. They rank each risk by how likely and how bad.',
    'Test small parts first. Then bigger pieces. Then the whole vehicle.',
  ],
  'L10-4': [
    'A Mars trip takes 6 to 9 months. Small burns fix the path on the way.',
    'Landing takes about 7 minutes. A shield, a parachute and rockets slow the craft.',
    'Radio is too slow to help. The craft must land itself.',
  ],
  'L11-1': [
    'A requirement says what the system must do. It must be something you can measure.',
    'Everything is linked. A bigger engine gives more push but weighs more.',
    'A trade study scores the options on cost, risk and performance. Then you pick one.',
  ],
  'L11-2': [
    'Reliability is how often a part works. 0.95 means 95 times out of 100.',
    'A backup helps, because both must fail. But only if they fail for different reasons.',
    'Fault protection watches for trouble. Safe mode keeps the craft alive and waits for help.',
  ],
  'L11-3': [
    'Nothing is known exactly. Thrust, wind and weight are all a bit off.',
    'Monte Carlo flies the rocket thousands of times with random changes. Then it counts successes.',
    'Structures get a safety factor, often 1.25 to 1.5. It is extra strength on purpose.',
  ],
  'L11-4': [
    'Teams prove the design on the ground first. They test parts, then engines, then the rocket.',
    'Spacecraft get shaken, blasted with noise, and heated and cooled in vacuum.',
    'You can start today. Learn maths and coding, try free tools, and join a club.',
  ],
};
