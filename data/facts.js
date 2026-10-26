// 30 short, true aerospace facts for the Home screen ("Did you know?"). One is shown per day, rotating.
export const FACTS = [
  'Space is said to start 100 km up. That line is called the Karman line.',
  'The space station orbits about 400 km up. It circles Earth every 90 minutes.',
  'The space station travels at about 28,000 km/h. That is roughly 23 times the speed of sound.',
  'An orbit is a fall that never lands. You move sideways so fast the ground curves away.',
  'To stay in a low orbit, a spacecraft needs a sideways speed of about 7.8 km/s.',
  'The Saturn V moon rocket was about 110 m tall. That is taller than the Statue of Liberty.',
  'Mach 1 is the speed of sound. At sea level that is about 343 m/s, or 1,235 km/h.',
  'Rockets meet "Max-Q" about a minute after liftoff. That is where air pushes on them the hardest.',
  'Voyager 1 was launched in 1977. It is now more than 20 billion km from Earth.',
  'Sunlight takes about 8 minutes and 20 seconds to reach the Earth.',
  'A radio message to Mars takes between about 3 and 22 minutes, depending on where the planets are.',
  'Konstantin Tsiolkovsky wrote the rocket equation in 1903. It is still the key rule of rocket design.',
  'Sputnik 1, the first satellite, was launched on 4 October 1957. It beeped for about three weeks.',
  'Yuri Gagarin became the first person in space on 12 April 1961. His flight lasted 108 minutes.',
  'Apollo 11 landed on the Moon on 20 July 1969.',
  'The Moon is about 384,000 km away. Light needs roughly 1.3 seconds to cross that gap.',
  'Astronauts float, but gravity at the station is still 90% as strong. They are falling around Earth.',
  'At liftoff, about 85 to 90 percent of a launch rocket is fuel and oxidiser.',
  'Staging drops empty tanks. The rocket stops carrying dead weight.',
  'A returning spacecraft can heat the air around it to more than 1,500 degrees Celsius.',
  'Gravity on Mars is only about 38% of Earth gravity.',
  'To escape Earth completely, a spacecraft needs a speed of about 11.2 km/s.',
  'A day on Venus is longer than its year. It spins once in 243 Earth days.',
  'Ion engines push gently but save lots of fuel. The Dawn probe used them to visit two asteroids.',
  'A geostationary satellite orbits 35,786 km up. It seems to hang still in the sky.',
  'In December 2015, a Falcon 9 first stage landed upright after launch. It was a first.',
  'The air at 100 km altitude is less than one millionth as thick as at sea level.',
  'The Perseverance rover landed on Mars on 18 February 2021. A "sky crane" lowered it on cables.',
  'The spin of Earth gives a free push. Launch east from the equator for up to 465 m/s.',
  'The Wright brothers made the first powered flight on 17 December 1903. It lasted 12 seconds.',
];

/** The fact for a given day (rotates once a day, same for the whole day). */
export function factOfTheDay(date = new Date()) {
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
  return FACTS[((day % FACTS.length) + FACTS.length) % FACTS.length];
}
