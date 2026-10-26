// ASTRA LAB Aerospace Academy - levels 7, 8, 9
const MU = 3.986004e14;   // Earth gravitational parameter, m^3/s^2
const RE = 6371000;       // mean Earth radius, m

export default [
  {
    id: 'L7', n: 7, title: 'Orbital Mechanics', icon: 'satellite',
    blurb: 'Learn how things stay up in orbit, how to change orbits, and how to leave Earth for other worlds.',
    lessons: [
      {
        id: 'L7-1', title: 'What is an orbit?', minutes: 7,
        tagline: 'An orbit is falling around a planet, forever missing the ground because you are moving sideways so fast.',
        definition: 'An orbit is the curved path an object follows around a planet or star when gravity is the only significant force acting on it. Orbital speed is the sideways speed needed to keep missing the surface; the orbital period is the time for one full lap.',
        why: 'Almost every space mission lives in an orbit at some point. Rockets are designed around one goal: give the payload enough sideways speed, not just height, to stay up.',
        explain: [
          'Imagine standing on a very tall mountain and throwing a ball. The harder you throw, the farther it lands. Now imagine you could throw it so fast that, as it falls, the ground curves away beneath it at the same rate. The ball keeps falling but never lands. That is an orbit: falling around the planet.',
          'So a satellite is not floating above gravity. Gravity is pulling on it all the time. At 400 km altitude, gravity is still about 89% as strong as on the ground. The astronauts on the space station feel weightless because they and the station are all in free fall together.',
          'How fast must you go? For a circular orbit, the speed depends only on the distance r from the planet centre: v = √(μ ÷ r). Here μ (say "mew") is the planet’s gravitational parameter, about 3.986×10¹⁴ m³/s² for Earth. At 400 km altitude that gives about 7.67 km/s, roughly 27,600 km/h.',
          'The lap time is the period: T = 2π √(r³ ÷ μ). Higher orbits are slower AND have longer laps. Low Earth orbit takes about 90 minutes per lap. The Moon, far higher, takes about 27 days.',
          'This creates a strange rule. To reach a higher orbit you must add speed, but once you get there you are moving more slowly than before. Energy went into height, not into speed.'
        ],
        keyIdeas: [
          'An orbit is continuous free fall with enough sideways speed to keep missing the planet.',
          'Orbital speed at 400 km altitude is about 7.7 km/s; the higher the orbit, the slower the speed.',
          'Astronauts are weightless because of free fall, not because gravity is gone.',
          'Period grows quickly with radius: T ∝ r^1.5.'
        ],
        equations: [
          { name: 'Circular orbital speed', formula: 'v = √(μ ÷ r)', vars: [['v', 'orbital speed', 'm/s'], ['μ', 'gravitational parameter (Earth: 3.986×10¹⁴)', 'm³/s²'], ['r', 'distance from planet centre', 'm']], meaning: 'The farther from the planet’s centre, the slower you need to move to stay in a circular orbit.' },
          { name: 'Orbital period', formula: 'T = 2π × √(r³ ÷ μ)', vars: [['T', 'time for one lap', 's'], ['r', 'orbit radius', 'm'], ['μ', 'gravitational parameter', 'm³/s²']], meaning: 'Bigger orbits take much longer to complete.' }
        ],
        example: { title: 'Worked example: the space station’s orbit', text: 'Altitude 400 km, so r = 6371 km + 400 km = 6771 km = 6.771×10⁶ m.\nSpeed: v = √(3.986×10¹⁴ ÷ 6.771×10⁶) = √(5.887×10⁷) ≈ 7,673 m/s.\nCircumference = 2π × 6.771×10⁶ ≈ 4.254×10⁷ m.\nPeriod: T = 4.254×10⁷ ÷ 7,673 ≈ 5,544 s ≈ 92 minutes.\nSo the station circles Earth about 15.6 times per day.' },
        diagram: 'orbit',
        mistakes: [
          'Myth: there is no gravity in space. Truth: gravity at 400 km is about 89% of surface gravity; weightlessness comes from free fall.',
          'Myth: satellites stay up because they are very high. Truth: sideways speed keeps them up. A satellite at rest at 400 km would fall straight down.',
          'Myth: to speed up in orbit you just fire forward and go faster. Truth: adding speed raises your orbit on the far side, and you end up moving slower overall at the higher altitude.'
        ],
        recap: 'An orbit is a fall that never hits the ground because the spacecraft moves sideways fast enough. Speed and period follow from the orbit radius: lower is faster, higher is slower.',
        lab: {
          title: 'Try it: orbit speed and lap time', intro: 'Pick an altitude above Earth’s surface and see the circular-orbit speed and period.',
          inputs: [{ id: 'h', label: 'Altitude', unit: 'km', min: 150, max: 40000, step: 10, value: 400 }],
          compute: (v) => { const r = (RE + Math.max(v.h, 0) * 1000); const s = Math.sqrt(MU / r); const T = 2 * Math.PI * Math.sqrt(r * r * r / MU); return [{ label: 'Orbital speed', value: s, unit: 'm/s', digits: 0 }, { label: 'Orbital period', value: T / 60, unit: 'min', digits: 1 }, { label: 'Laps per day', value: 86400 / T, unit: 'laps', digits: 2 }]; },
          note: 'Try 35,786 km: the period becomes about 24 hours (1436 min), so the satellite stays over one spot. Notice speed falls as you go higher.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Build me a rocket that puts a 500 kg satellite into a 400 km circular orbit around Earth.', screen: 'simulation' },
        quiz: [
          { q: 'Why does a satellite in orbit not fall to the ground?', options: ['There is no gravity up there', 'It moves sideways so fast that the ground curves away as it falls', 'Its engines hold it up', 'The air pushes it up'], answer: 1, why: 'It is constantly falling, but its sideways speed makes it miss the planet.' },
          { q: 'What happens to circular orbital speed as altitude increases?', options: ['It increases', 'It stays the same', 'It decreases', 'It becomes zero'], answer: 2, why: 'v = √(μ ÷ r): a bigger r gives a smaller speed.' },
          { q: 'About how long is one lap of the space station at 400 km?', options: ['About 9 minutes', 'About 92 minutes', 'About 24 hours', 'About 27 days'], answer: 1, why: 'T = 2π√(r³/μ) ≈ 5,540 s, which is roughly 92 minutes.' }
        ]
      },
      {
        id: 'L7-2', title: 'Ellipses: periapsis and apoapsis', minutes: 7,
        tagline: 'Most orbits are ellipses: fast and low at one end, slow and high at the other.',
        definition: 'An ellipse is a stretched circle. Periapsis is the closest point of an orbit to the body it circles (perigee for Earth) and apoapsis is the farthest point (apogee for Earth). The semi-major axis a is half of the long width of the ellipse.',
        why: 'Real missions rarely start in perfect circles. Rocket upper stages leave a spacecraft in an ellipse, and clever ellipses are used to reach high orbits and other planets efficiently.',
        explain: [
          'Circles are just the special case of orbits. If your speed at some point is a bit more or a bit less than circular speed, your path becomes an ellipse with the planet at one focus (a special point inside the ellipse, not the centre).',
          'Speed changes along the path. Near the planet you are deep in the gravity well, so you move fast. Far away you climb and slow down. Think of a roller coaster: fastest at the bottom, slowest at the top. The same trade between height and speed happens every lap.',
          'The vis-viva equation gives your speed anywhere on the orbit: v = √(μ × (2 ÷ r − 1 ÷ a)). Set r = a and it gives the circular formula, so you can trust it for circles too. It also shows that at a given distance r, a bigger orbit (larger a) means a higher speed.',
          'Another helpful fact: the orbit period depends only on a. T = 2π √(a³ ÷ μ). A long thin ellipse and a circle with the same a have the same period.',
          'A famous example is the geostationary transfer orbit (GTO). It has a low point near 300 km and a high point at 35,786 km. Rockets often leave satellites there; the satellite then fires its own engine at apogee to make a circle.'
        ],
        keyIdeas: [
          'Periapsis = closest and fastest point; apoapsis = farthest and slowest point.',
          'The vis-viva equation gives speed at any point: v = √(μ(2/r − 1/a)).',
          'Period depends only on the semi-major axis a.',
          'a = (periapsis radius + apoapsis radius) ÷ 2, measured from the planet’s centre.'
        ],
        equations: [
          { name: 'Vis-viva equation', formula: 'v = √( μ × (2 ÷ r − 1 ÷ a) )', vars: [['v', 'speed at that point', 'm/s'], ['μ', 'gravitational parameter', 'm³/s²'], ['r', 'current distance from centre', 'm'], ['a', 'semi-major axis', 'm']], meaning: 'Your speed depends on where you are (r) and the size of your orbit (a).' },
          { name: 'Semi-major axis', formula: 'a = (r_p + r_a) ÷ 2', vars: [['a', 'semi-major axis', 'm'], ['r_p', 'radius at periapsis', 'm'], ['r_a', 'radius at apoapsis', 'm']], meaning: 'It is the average of the closest and farthest distances from the centre.' }
        ],
        example: { title: 'Worked example: a transfer orbit', text: 'Perigee altitude 300 km, apogee altitude 35,786 km.\nr_p = 6671 km, r_a = 42,157 km, so a = 24,414 km.\nSpeed at perigee: v = √(3.986×10¹⁴ × (2 ÷ 6.671×10⁶ − 1 ÷ 2.4414×10⁷)) ≈ 10,158 m/s (a circular orbit there would be only 7,730 m/s).\nSpeed at apogee: v ≈ 1,607 m/s.\nCheck: 10,158 × 6,671 km ≈ 1,607 × 42,157 km. Yes, they match, because angular momentum is conserved.\nPeriod: T = 2π √(a³ ÷ μ) ≈ 37,960 s ≈ 10.5 hours.' },
        diagram: 'orbit',
        mistakes: [
          'Myth: the planet sits at the centre of the ellipse. Truth: it sits at one focus, off-centre, which is why there is a near point and a far point.',
          'Myth: altitude and radius are the same thing. Truth: orbit formulas use distance from the planet’s centre, so add the planet’s radius (6371 km for Earth) to altitude.',
          'Myth: a spacecraft goes fastest when it is far away. Truth: it is fastest at periapsis, closest to the planet.'
        ],
        recap: 'Most orbits are ellipses with a fast low point and a slow high point. The vis-viva equation gives the speed anywhere, and the period depends only on the semi-major axis.',
        lab: {
          title: 'Try it: design an ellipse', intro: 'Set the lowest and highest altitudes and read off the speeds and period.',
          inputs: [{ id: 'hp', label: 'Periapsis altitude', unit: 'km', min: 200, max: 40000, step: 10, value: 300 }, { id: 'ha', label: 'Apoapsis altitude', unit: 'km', min: 200, max: 400000, step: 100, value: 35786 }],
          compute: (v) => { const lo = Math.min(v.hp, v.ha), hi = Math.max(v.hp, v.ha); const rp = RE + lo * 1000, ra = RE + hi * 1000; const a = (rp + ra) / 2; const vp = Math.sqrt(MU * (2 / rp - 1 / a)); const va = Math.sqrt(MU * (2 / ra - 1 / a)); const T = 2 * Math.PI * Math.sqrt(a * a * a / MU); return [{ label: 'Speed at periapsis', value: vp, unit: 'm/s', digits: 0 }, { label: 'Speed at apoapsis', value: va, unit: 'm/s', digits: 0 }, { label: 'Semi-major axis', value: a / 1000, unit: 'km', digits: 0 }, { label: 'Period', value: T / 3600, unit: 'hours', digits: 2 }]; },
          note: 'Make the two altitudes equal and both speeds match: a circle. Stretch the apoapsis and watch the speed there drop toward a crawl.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Launch a 300 kg satellite into an elliptical Earth orbit with 300 km perigee and 35,786 km apogee and show me the speed at each end.', screen: 'simulation' },
        quiz: [
          { q: 'Where on an elliptical orbit is the spacecraft moving fastest?', options: ['Apoapsis', 'Periapsis', 'The same everywhere', 'At the centre of the ellipse'], answer: 1, why: 'Closest to the planet it is deepest in gravity, so its speed is highest.' },
          { q: 'Perigee radius is 6,700 km and apogee radius is 42,100 km. What is the semi-major axis?', options: ['About 35,400 km', 'About 24,400 km', 'About 48,800 km', 'About 6,700 km'], answer: 1, why: 'a = (6,700 + 42,100) ÷ 2 = 24,400 km.' },
          { q: 'Two orbits have the same semi-major axis but different shapes. What is true of their periods?', options: ['The more stretched one is longer', 'The rounder one is longer', 'They are equal', 'It depends on the satellite mass'], answer: 2, why: 'Period depends only on a, so they are equal.' }
        ]
      },
      {
        id: 'L7-3', title: 'Changing orbits: delta-v and the Hohmann transfer', minutes: 8,
        tagline: 'Two short engine burns move you between circular orbits using the least fuel.',
        definition: 'Delta-v (Δv) is the total change in velocity a spacecraft can produce with its engine; it is the “currency” of space travel. A Hohmann transfer is a two-burn manoeuvre that moves a spacecraft between two circular orbits along an ellipse that touches both.',
        why: 'Fuel is the biggest part of a rocket’s mass, and Δv tells you how much fuel you need. Knowing the cheapest way to change orbits saves enormous mass and money.',
        explain: [
          'In space you cannot simply “drive” somewhere. Moving costs Δv, and every burn changes your orbit. The rocket equation converts a Δv budget into fuel mass, so mission planners count Δv the way travellers count money.',
          'To go from a low circular orbit to a higher one, first burn forward at your low point. This raises the opposite side of your orbit and makes an ellipse whose high point touches the target orbit. You then coast, getting slower as you climb.',
          'When you reach the high point, you are moving too slowly to stay at that height, so you burn forward again. That second burn lifts the low side of the orbit and makes it circular. Two burns, one half of an ellipse in between: the Hohmann transfer.',
          'For a trip from LEO (400 km) to geostationary orbit (35,786 km), the first burn is about 2.40 km/s and the second is about 1.46 km/s. The total is about 3.86 km/s, and the coast takes about 5.3 hours. Reversing the moves brings you back down.',
          'Tricks like changing the tilt of an orbit (an “inclination change”) can be very costly. A 30° plane change at LEO speed costs about 4 km/s. That is why rockets launch from near the equator toward the east, and why mission planners combine burns when they can.'
        ],
        keyIdeas: [
          'Δv is the fuel-cost measure of a manoeuvre; the rocket equation turns Δv into propellant mass.',
          'A Hohmann transfer uses two forward burns and a half-ellipse coast.',
          'Burn at the low point to raise the high point, and burn at the high point to raise the low point.',
          'Plane changes are expensive, so launch and plan to avoid them.'
        ],
        equations: [
          { name: 'Hohmann burn 1', formula: 'Δv₁ = √(μ ÷ r₁) × ( √(2r₂ ÷ (r₁ + r₂)) − 1 )', vars: [['Δv₁', 'first burn', 'm/s'], ['r₁', 'starting orbit radius', 'm'], ['r₂', 'target orbit radius', 'm'], ['μ', 'gravitational parameter', 'm³/s²']], meaning: 'The first burn gives you the extra speed to start climbing onto the transfer ellipse.' },
          { name: 'Hohmann burn 2', formula: 'Δv₂ = √(μ ÷ r₂) × ( 1 − √(2r₁ ÷ (r₁ + r₂)) )', vars: [['Δv₂', 'second burn', 'm/s'], ['r₁', 'starting orbit radius', 'm'], ['r₂', 'target orbit radius', 'm']], meaning: 'The second burn speeds you up from the slow apogee speed to the target orbit’s circular speed.' }
        ],
        example: { title: 'Worked example: LEO to GEO', text: 'r₁ = 6,771 km (400 km altitude), r₂ = 42,164 km (GEO).\nTransfer semi-major axis a = (6,771 + 42,164) ÷ 2 = 24,468 km.\nSpeed at low end of the transfer: 10,072 m/s. Circular speed at r₁: 7,673 m/s. So Δv₁ ≈ 2,399 m/s.\nSpeed at high end of the transfer: 1,618 m/s. Circular speed at GEO: 3,075 m/s. So Δv₂ ≈ 1,457 m/s.\nTotal Δv ≈ 3,856 m/s. Coast time = half the transfer period = π √(a³ ÷ μ) ≈ 19,000 s ≈ 5.3 hours.' },
        diagram: 'hohmann',
        mistakes: [
          'Myth: to go to a higher orbit you burn upward. Truth: you burn along the direction of travel (prograde); the orbit rises by itself.',
          'Myth: the higher orbit needs more speed than the lower one. Truth: a higher circular orbit is slower, but the trip up costs Δv in total because you must first speed up, and then again to circularise.',
          'Myth: Δv is the same as engine thrust. Truth: thrust is a force; Δv is the change in speed the whole fuel load can deliver.'
        ],
        recap: 'Δv is the price of moving in space. A Hohmann transfer changes orbit with two forward burns and a half-ellipse coast, and is the classic minimum-fuel move between circular orbits.',
        lab: {
          title: 'Try it: Hohmann calculator', intro: 'Choose a starting and a target circular orbit altitude around Earth.',
          inputs: [{ id: 'h1', label: 'Start altitude', unit: 'km', min: 200, max: 40000, step: 50, value: 400 }, { id: 'h2', label: 'Target altitude', unit: 'km', min: 200, max: 400000, step: 100, value: 35786 }],
          compute: (v) => { const r1 = RE + v.h1 * 1000, r2 = RE + v.h2 * 1000; const s = r1 + r2; const d1 = Math.abs(Math.sqrt(MU / r1) * (Math.sqrt(2 * r2 / s) - 1)); const d2 = Math.abs(Math.sqrt(MU / r2) * (1 - Math.sqrt(2 * r1 / s))); const a = s / 2; const t = Math.PI * Math.sqrt(a * a * a / MU); return [{ label: 'Burn 1', value: d1, unit: 'm/s', digits: 0 }, { label: 'Burn 2', value: d2, unit: 'm/s', digits: 0 }, { label: 'Total Δv', value: d1 + d2, unit: 'm/s', digits: 0 }, { label: 'Transfer time', value: t / 3600, unit: 'hours', digits: 2 }]; },
          note: 'Try a target around 1,000 km to see a small cost, then go out to the Moon’s distance (about 384,000 km) to see how the total grows.'
        },
        sim: { label: 'Show me in the planner', ask: 'Plan a Hohmann transfer from a 400 km circular Earth orbit to geostationary orbit and show the delta-v of each burn.', screen: 'planner' },
        quiz: [
          { q: 'How many engine burns does a basic Hohmann transfer need?', options: ['One', 'Two', 'Three', 'Continuous thrust'], answer: 1, why: 'One burn to enter the transfer ellipse, one to circularise at the target.' },
          { q: 'To raise your orbit you should fire the engine…', options: ['Straight up', 'Backward against travel', 'Forward along your direction of motion', 'Toward the Sun'], answer: 2, why: 'A prograde burn adds speed and lifts the opposite side of the orbit.' },
          { q: 'What does delta-v measure?', options: ['The engine’s force', 'The change in velocity a manoeuvre needs or a rocket can supply', 'The fuel tank volume', 'The orbit period'], answer: 1, why: 'Δv is the velocity change budget that links fuel to manoeuvres.' }
        ]
      },
      {
        id: 'L7-4', title: 'Escape, other planets and orbit types', minutes: 8,
        tagline: 'Go fast enough and you leave; choose the right orbit and the mission does its job.',
        definition: 'Escape velocity is the minimum speed needed to leave a planet’s gravity and never fall back (ignoring air drag). Patched conics is a method that splits a trip into pieces, each dominated by one body’s gravity: Earth, then the Sun, then the destination.',
        why: 'Interplanetary missions, weather satellites, GPS and Earth-observation satellites all depend on choosing where and how fast to go. Escape and orbit choice decide the rocket size.',
        explain: [
          'Escape velocity is v = √(2μ ÷ r), which is exactly √2 (about 1.41) times circular orbit speed. From Earth’s surface it is about 11.2 km/s. From a 400 km orbit it is about 10.85 km/s. On the Moon it is only about 2.4 km/s, because it is small and light.',
          'To travel to Mars, planners use patched conics. Step one: leave Earth’s gravity with some extra speed left over, called the hyperbolic excess speed (v∞). Step two: coast around the Sun on a big ellipse that touches Earth’s orbit and Mars’s orbit. Step three: get captured by Mars’s gravity.',
          'The leftover speed after leaving Earth is what matters for the trip, but you must also climb out of Earth’s well. The departure speed from a circular parking orbit is √(v∞² + v_esc²). For Mars, v∞ is about 2.9 km/s, so from 400 km orbit you need roughly 3.6 km/s of Δv. The trip takes about 8 to 9 months, and good launch windows happen roughly every 26 months.',
          'Earth orbit types serve different jobs. Low Earth orbit (LEO, about 160 to 2,000 km) suits the space station and imaging satellites. Medium Earth orbit (MEO, around 20,000 km) is used by navigation-satellite constellations.',
          'Geostationary orbit (GEO) is at 35,786 km above the equator with a 24-hour period, so a satellite hangs over one spot; ideal for weather and TV. A polar orbit passes over the poles and, as Earth turns below, scans the whole planet. A sun-synchronous orbit (about 600 to 800 km, tilted roughly 98°) passes over each place at the same local time each day.'
        ],
        keyIdeas: [
          'Escape speed is √2 times circular speed: about 11.2 km/s at Earth’s surface.',
          'Interplanetary trips are patched conics: Earth departure, solar coast, target arrival.',
          'GEO is 35,786 km up with a 24 h period; LEO is a fast, roughly 90-minute lap.',
          'Polar and sun-synchronous orbits cover the whole Earth over time.'
        ],
        equations: [
          { name: 'Escape velocity', formula: 'v_esc = √(2μ ÷ r)', vars: [['v_esc', 'escape speed', 'm/s'], ['μ', 'gravitational parameter', 'm³/s²'], ['r', 'distance from centre', 'm']], meaning: 'The speed at which your kinetic energy exactly balances gravity’s pull, so you coast away and slow to a stop at infinity.' },
          { name: 'Departure speed from parking orbit', formula: 'v_dep = √(v∞² + v_esc²)', vars: [['v_dep', 'speed needed at the burn', 'm/s'], ['v∞', 'leftover speed after leaving', 'm/s'], ['v_esc', 'escape speed at the burn point', 'm/s']], meaning: 'You need escape speed plus a bit more, combined in a square-root sum.' }
        ],
        example: { title: 'Worked example: a Mars departure burn', text: 'Parking orbit 400 km: r = 6,771 km.\nCircular speed = 7,673 m/s. Escape speed = √2 × 7,673 ≈ 10,851 m/s.\nMars transfer needs v∞ ≈ 2,900 m/s.\nv_dep = √(2,900² + 10,851²) = √(8.41×10⁶ + 1.1774×10⁸) ≈ 11,228 m/s.\nΔv = 11,228 − 7,673 ≈ 3,555 m/s, so roughly 3.6 km/s.' },
        diagram: null,
        mistakes: [
          'Myth: escape velocity is the speed a rocket must hold all the way up. Truth: it is the speed needed at one moment (e.g. burnout) if you then coast; rockets can leave slowly if the engine keeps firing.',
          'Myth: geostationary and geosynchronous are the same. Truth: geosynchronous has a 24-hour period but may be tilted or elliptical; geostationary is also circular, over the equator, and stays fixed over a point.',
          'Myth: you fly straight at Mars. Truth: Mars moves, so the path is a curved ellipse around the Sun, timed to arrive when Mars is there.'
        ],
        recap: 'Escape speed is √2 times orbital speed and sets what leaving a planet takes. Patched conics splits a planet-to-planet trip into simple pieces, and different orbit types (LEO, GEO, polar) fit different jobs.',
        lab: {
          title: 'Try it: escape speed of any world', intro: 'Set a body’s mass and radius as multiples of Earth’s and see its surface escape speed.',
          inputs: [{ id: 'm', label: 'Mass (Earth = 1)', unit: '×', min: 0.001, max: 320, step: 0.001, value: 1 }, { id: 'r', label: 'Radius (Earth = 1)', unit: '×', min: 0.05, max: 11, step: 0.01, value: 1 }],
          compute: (v) => { const r = Math.max(v.r, 0.001); const ve = 11186 * Math.sqrt(Math.max(v.m, 0) / r); return [{ label: 'Escape speed', value: ve, unit: 'm/s', digits: 0 }, { label: 'Low circular orbit speed', value: ve / Math.SQRT2, unit: 'm/s', digits: 0 }]; },
          note: 'The Moon is about 0.0123 mass and 0.273 radius (about 2,380 m/s). Jupiter is about 318 mass and 11 radius (about 60,000 m/s).'
        },
        sim: { label: 'Show me in the planner', ask: 'Plan a Mars transfer from a 400 km Earth parking orbit and show the departure delta-v and transfer time.', screen: 'planner' },
        quiz: [
          { q: 'How does escape velocity relate to circular orbital speed at the same distance?', options: ['They are equal', 'Escape is 2 times bigger', 'Escape is √2 times bigger', 'Escape is half as big'], answer: 2, why: 'v_esc = √(2μ/r) = √2 × √(μ/r).' },
          { q: 'What makes an orbit geostationary?', options: ['It passes over both poles', '35,786 km up, circular, over the equator, with a 24-hour period', 'It is 400 km up', 'It is a very stretched ellipse'], answer: 1, why: 'At that height the lap time matches Earth’s rotation, so the satellite hovers over one point.' },
          { q: 'Why does a polar orbit suit Earth-mapping satellites?', options: ['It is the fastest orbit', 'As Earth rotates beneath it, the satellite sees the whole planet', 'It never needs fuel', 'It stays over the equator'], answer: 1, why: 'The orbit stays fixed in space while Earth turns underneath, so every part of the surface passes below.' }
        ]
      }
    ]
  },
  {
    id: 'L8', n: 8, title: 'Spacecraft Engineering', icon: 'tools',
    blurb: 'Discover how a spacecraft gets power, stays the right temperature, talks to Earth, and survives landing.',
    lessons: [
      {
        id: 'L8-1', title: 'Spacecraft subsystems, structure and materials', minutes: 7,
        tagline: 'A spacecraft is a team of subsystems built on a frame that must survive the violent ride to space.',
        definition: 'A subsystem is a group of parts with one job, such as power, thermal, communications or structure. Structure is the frame and skin that hold everything together and carry loads. Stress is force per area (σ = F ÷ A) inside a material.',
        why: 'Every kilogram costs launch fuel, so designers try to make each subsystem as light as possible while keeping it strong. Understanding the subsystems shows where a design can fail.',
        explain: [
          'Think of a spacecraft as a tiny city. It needs a power plant (power subsystem), a heating and cooling system (thermal), a phone line home (communications), a brain (the computer, called command and data handling), a sense of direction (guidance, navigation and control), engines (propulsion) and a frame (structure). Then it needs a reason to fly: the payload, such as cameras or instruments.',
          'Each subsystem depends on the others. More power needs bigger panels, which makes the structure heavier and changes how it points. Designers keep a mass budget and a power budget: a spreadsheet listing every part so the totals never exceed what the rocket can carry.',
          'The ride to space is the toughest test. During launch, the spacecraft shakes, hears roaring noise and can feel around 4 to 6 times its weight (4 to 6 g). The structure must survive that yet stay very light.',
          'Materials are chosen for strength for their weight. Aluminium alloys are light and easy to build with. Titanium is stronger and handles heat but costs more. Carbon-fibre composites are stiff and light and are used for tubes, panels and rocket bodies. Stainless steel is heavier, but it stays strong at very high and very low temperatures and is cheap.',
          'Engineers apply a safety factor, commonly about 1.25 to 1.5 for flight structures. This means the part is designed to survive 25% to 50% more load than the biggest expected one. The extra strength is the margin.'
        ],
        keyIdeas: [
          'Main subsystems: structure, power, thermal, communications, computer, GNC, propulsion, plus the payload.',
          'Every part is limited by mass and power budgets.',
          'Launch loads (vibration, noise, several g) set the structural needs.',
          'Safety factors keep parts from failing when reality is worse than the plan.'
        ],
        equations: [
          { name: 'Stress', formula: 'σ = F ÷ A', vars: [['σ', 'stress', 'Pa'], ['F', 'force carried', 'N'], ['A', 'cross-section area', 'm²']], meaning: 'The same force is harder on a thin part than on a thick one.' },
          { name: 'Safety factor', formula: 'SF = strength ÷ stress', vars: [['SF', 'safety factor', '–'], ['strength', 'material yield strength', 'Pa'], ['stress', 'actual stress', 'Pa']], meaning: 'A safety factor above 1 means the material is not stressed to its limit.' }
        ],
        example: { title: 'Worked example: a probe under launch load', text: 'A 500 kg probe feels 6 g on its support tube.\nForce F = 500 × 6 × 9.81 = 29,430 N.\nTube cross-section A = 0.002 m² (20 cm²).\nStress σ = 29,430 ÷ 0.002 ≈ 14.7×10⁶ Pa = 14.7 MPa.\nAluminium 6061-T6 yields at about 275 MPa, so safety factor ≈ 275 ÷ 14.7 ≈ 19. The tube is very strong here; a designer could thin it to save mass (buckling and other loads must be checked too).' },
        diagram: null,
        mistakes: [
          'Myth: heavier parts are safer. Truth: extra mass costs launch fuel; good design uses just enough material with a sensible margin.',
          'Myth: the payload is the whole spacecraft. Truth: the payload is often less than half the mass. Subsystems keep it alive and working.',
          'Myth: a stronger material always wins. Truth: engineers compare strength per mass, cost, heat tolerance and how easily it can be built.'
        ],
        recap: 'A spacecraft is a set of subsystems built on a strong, light structure that must survive launch loads. Designers balance mass and power budgets and add safety margins.',
        lab: {
          title: 'Try it: stress on a support tube', intro: 'Set the mass, launch g-load and tube area to see stress and safety factor for aluminium (yield about 275 MPa).',
          inputs: [{ id: 'm', label: 'Spacecraft mass', unit: 'kg', min: 10, max: 20000, step: 10, value: 500 }, { id: 'g', label: 'Launch load', unit: 'g', min: 1, max: 12, step: 0.5, value: 6 }, { id: 'a', label: 'Tube cross-section', unit: 'cm²', min: 1, max: 200, step: 1, value: 20 }],
          compute: (v) => { const F = v.m * v.g * 9.81; const A = Math.max(v.a, 0.01) / 1e4; const s = F / A; return [{ label: 'Force', value: F, unit: 'N', digits: 0 }, { label: 'Stress', value: s / 1e6, unit: 'MPa', digits: 1 }, { label: 'Safety factor (aluminium)', value: 275e6 / s, unit: '×', digits: 1 }]; },
          note: 'Shrink the area until the safety factor drops toward 1.25. Below that, the design would be rejected.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Build me a small space probe of about 500 kg with power, communications and a camera, and show its mass breakdown by subsystem.', screen: 'designer' },
        quiz: [
          { q: 'Which is NOT normally one of a spacecraft’s subsystems?', options: ['Power', 'Thermal control', 'Communications', 'Weather forecasting'], answer: 3, why: 'Power, thermal and communications are standard subsystems; forecasting is not part of the spacecraft.' },
          { q: 'A 1,000 N force acts on a part with 0.001 m² area. What is the stress?', options: ['1 kPa', '1 MPa', '1 GPa', '1 Pa'], answer: 1, why: 'σ = 1,000 ÷ 0.001 = 1,000,000 Pa = 1 MPa.' },
          { q: 'Why do engineers include a safety factor?', options: ['To make the spacecraft heavier', 'To cover uncertainty so parts do not fail under worse-than-expected loads', 'Because it is fashionable', 'To reduce cost'], answer: 1, why: 'Real loads and materials vary, so a margin protects against surprises.' }
        ]
      },
      {
        id: 'L8-2', title: 'Power and thermal control', minutes: 8,
        tagline: 'Solar panels and batteries make electricity; radiators and blankets keep the temperature just right.',
        definition: 'Solar irradiance is the Sun’s power falling on each square metre (about 1,361 W/m² at Earth’s distance). Thermal control is the design of a spacecraft to keep every part inside its allowed temperature range. Radiators shed extra heat as infrared light.',
        why: 'Without power a spacecraft goes dead. Without thermal control its electronics overheat in sunlight or freeze in shadow. Both drive the size, shape and cost of the design.',
        explain: [
          'Most spacecraft near Earth get power from solar panels. Each panel turns a fraction of sunlight (its efficiency, often about 25% to 32% for modern space-grade cells) into electricity. Power is P = S × A × η × cos θ, where S is sunlight intensity, A is panel area, η is efficiency and θ is the angle between the panel’s face and the Sun.',
          'Sunlight weakens with distance squared. At Mars (about 1.5 times farther from the Sun than Earth) it is only about 590 W/m². At Jupiter (5.2 times) it is about 50 W/m². So probes to the outer planets often use other sources, such as radioisotope power, which turns heat from decaying material into electricity.',
          'In low Earth orbit the station passes into Earth’s shadow for roughly 35 minutes of each 92-minute lap. Batteries store energy in sunlight and supply it during eclipse. To make batteries last thousands of cycles, designers use only part of their capacity, such as 30%.',
          'Heat is the other big problem. In space there is no air to carry heat away, so heat leaves mainly by radiation, following P = ε σ A T⁴ (σ = 5.67×10⁻⁸ W/m²·K⁴). Hot radiators lose heat very quickly because temperature is to the fourth power.',
          'Designers combine tools: multi-layer insulation (shiny “space blankets”) to slow heat loss, white or reflective paint to reject sunlight, heaters for cold periods, radiators for extra heat, and heat pipes to move heat around. Note the Sun side can reach over 100 °C while the shade side goes below −100 °C.'
        ],
        keyIdeas: [
          'Solar power = S × A × efficiency × cos(angle to the Sun).',
          'Sunlight falls with the square of distance from the Sun.',
          'Batteries carry the spacecraft through eclipse; only part of capacity is used.',
          'In vacuum heat leaves by radiation, so radiator size grows as 1/T⁴.'
        ],
        equations: [
          { name: 'Solar array power', formula: 'P = S × A × η × cos θ', vars: [['P', 'electrical power', 'W'], ['S', 'sunlight intensity', 'W/m²'], ['A', 'panel area', 'm²'], ['η', 'cell efficiency (0 to 1)', '–'], ['θ', 'angle away from facing the Sun', '°']], meaning: 'Bigger, more efficient panels pointed at the Sun make more power.' },
          { name: 'Radiated heat', formula: 'P = ε × σ × A × T⁴', vars: [['P', 'heat radiated', 'W'], ['ε', 'emissivity (0 to 1)', '–'], ['σ', 'Stefan–Boltzmann constant, 5.67×10⁻⁸', 'W/m²·K⁴'], ['A', 'radiator area', 'm²'], ['T', 'absolute temperature', 'K']], meaning: 'A hotter surface radiates far more heat; doubling T gives 16 times the power.' }
        ],
        example: { title: 'Worked example: power and battery sizing', text: 'Panels: 10 m² at 30% efficiency facing the Sun near Earth (S = 1,361 W/m²).\nP = 1,361 × 10 × 0.30 = 4,083 W.\nEclipse: the load is 500 W for 36 minutes = 0.6 h, so energy needed = 500 × 0.6 = 300 Wh.\nIf we only use 30% of the battery, capacity = 300 ÷ 0.30 = 1,000 Wh.\nRadiator: to dump 1,000 W at 300 K with ε = 0.85: A = 1,000 ÷ (0.85 × 5.67×10⁻⁸ × 300⁴) ≈ 2.6 m² (ignoring heat coming in from the Sun and Earth).' },
        diagram: null,
        mistakes: [
          'Myth: space is cold so spacecraft get cold. Truth: in sunlight a surface can become very hot; without air, shedding heat is hard.',
          'Myth: solar power is unlimited. Truth: it drops with distance squared and disappears in eclipse.',
          'Myth: a battery can be fully drained each orbit. Truth: deep discharge shortens battery life, so designers oversize batteries.'
        ],
        recap: 'Solar panels turn sunlight into power that shrinks with distance squared, and batteries cover the eclipse. Because heat can only leave by radiation, thermal designs use insulation, coatings, heaters and radiators.',
        lab: {
          title: 'Try it: solar array power', intro: 'Choose your distance from the Sun, panel area, efficiency and pointing angle.',
          inputs: [{ id: 'd', label: 'Distance from Sun', unit: 'AU', min: 0.3, max: 10, step: 0.1, value: 1 }, { id: 'a', label: 'Panel area', unit: 'm²', min: 0.1, max: 200, step: 0.1, value: 10 }, { id: 'e', label: 'Efficiency', unit: '%', min: 5, max: 40, step: 1, value: 30 }, { id: 't', label: 'Angle off the Sun', unit: '°', min: 0, max: 89, step: 1, value: 0 }],
          compute: (v) => { const d = Math.max(v.d, 0.01); const S = 1361 / (d * d); const P = S * v.a * (v.e / 100) * Math.cos(v.t * Math.PI / 180); return [{ label: 'Sunlight intensity', value: S, unit: 'W/m²', digits: 0 }, { label: 'Electrical power', value: P, unit: 'W', digits: 0 }]; },
          note: 'Move out to 5.2 AU (Jupiter) and see how huge the panels must become. Tilting the panels 60° halves the power.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Design a satellite whose solar panels make at least 1 kW at Earth and show me its power budget and battery size for eclipse.', screen: 'designer' },
        quiz: [
          { q: 'Sunlight at 2 AU from the Sun is roughly what fraction of that at Earth?', options: ['1/2', '1/4', '1/8', '2 times'], answer: 1, why: 'Intensity falls with distance squared: 1/2² = 1/4.' },
          { q: 'How does a spacecraft in vacuum mainly lose heat?', options: ['Convection with air', 'Conduction to the ground', 'Radiation', 'Evaporation'], answer: 2, why: 'With no air, infrared radiation is the main way to shed heat.' },
          { q: 'Why does a spacecraft carry batteries?', options: ['To start the engines', 'To supply power when it is in Earth’s shadow', 'To make it heavier', 'To speed up the radio'], answer: 1, why: 'Batteries store solar energy for eclipse.' }
        ]
      },
      {
        id: 'L8-3', title: 'Communications: signals, delay and links', minutes: 7,
        tagline: 'Radio waves carry data across space at the speed of light, weakening with the square of distance.',
        definition: 'A communications link is the radio connection between a spacecraft and a ground station. Latency (delay) is the time a signal needs to travel, equal to distance divided by the speed of light (about 300,000 km/s).',
        why: 'Distance sets both how weak the signal is and how long every message takes. That decides how fast data can flow and whether a spacecraft must act on its own.',
        explain: [
          'Spacecraft talk to Earth using radio waves, the same kind of waves as a Wi-Fi router, but focused and much more carefully designed. Data is encoded into the wave. Different frequency bands are used: S-band for basic commands, X-band and Ka-band for faster science data.',
          'Radio moves at the speed of light, so distance means delay. The Moon is 384,400 km away, so a signal takes about 1.3 seconds one way. The Sun is about 8.3 minutes away by light. Mars ranges between roughly 3 and 22 minutes one way, depending on where the planets are in their orbits.',
          'Signal strength drops with the square of distance. Twice as far means four times weaker; ten times as far means one hundred times weaker. By the time the signal from a probe far beyond Mars arrives, it can be trillions of times weaker than what the transmitter sent out. Ground stations use huge dishes, up to about 70 m wide, and very sensitive receivers.',
          'Designers boost the link in several ways: bigger antennas (which focus the beam like a torch), more transmitter power, slower data rates (slower data is easier to pick out from noise) and clever error-correcting codes. Relay satellites orbiting a planet help too: a rover sends to an orbiter overhead, which sends on to Earth.',
          'Because Mars commands take 10 to 40 minutes for a round trip, you cannot steer a rover with a joystick. The rover gets a plan for the day, drives itself carefully and reports back later. Autonomy is a direct consequence of delay.'
        ],
        keyIdeas: [
          'One-way delay = distance ÷ speed of light.',
          'Received signal power falls with distance squared.',
          'Big antennas, more power, slower rates and relay orbiters strengthen a link.',
          'Long delays force spacecraft to make decisions on their own.'
        ],
        equations: [
          { name: 'Signal delay', formula: 't = d ÷ c', vars: [['t', 'one-way delay', 's'], ['d', 'distance', 'm'], ['c', 'speed of light, 3.0×10⁸', 'm/s']], meaning: 'Even at light speed, deep space is far, so messages take time.' },
          { name: 'Inverse-square weakening', formula: 'P₂ = P₁ × (d₁ ÷ d₂)²', vars: [['P₁', 'signal power at distance 1', 'W'], ['P₂', 'signal power at distance 2', 'W'], ['d₁, d₂', 'the two distances', 'm']], meaning: 'Doubling the distance cuts the received power to one quarter.' }
        ],
        example: { title: 'Worked example: a call to Mars', text: 'Mars is 225 million km away (a typical average).\nd = 2.25×10¹¹ m.\nOne-way delay t = 2.25×10¹¹ ÷ 3.0×10⁸ = 750 s = 12.5 minutes.\nRound trip = 25 minutes, so a question and its answer take 25 minutes.\nCompare the Moon: 384,400 km gives 1.28 s one way.\nSignal power ratio (Moon link vs Mars link) = (225,000,000 ÷ 384,400)² ≈ 342,600, so the Mars signal is about 340,000 times weaker for the same equipment.' },
        diagram: null,
        mistakes: [
          'Myth: radio signals are instant. Truth: they move at the speed of light, which still takes minutes across the Solar System.',
          'Myth: to double the range, double the power. Truth: because of the inverse-square law you need four times the power (or a bigger antenna).',
          'Myth: sound also crosses space. Truth: sound needs air; radio and light are electromagnetic waves that travel through vacuum.'
        ],
        recap: 'Radio signals travel at light speed, so distant spacecraft have delays of minutes and weak signals that fall with distance squared. Big antennas, relays and onboard autonomy make deep-space missions work.',
        lab: {
          title: 'Try it: delay and signal loss', intro: 'Pick a distance in millions of kilometres.',
          inputs: [{ id: 'd', label: 'Distance', unit: 'million km', min: 0.01, max: 6000, step: 0.1, value: 225 }],
          compute: (v) => { const d = Math.max(v.d, 0.001); const t = d * 1e9 / 3e8; return [{ label: 'One-way delay', value: t / 60, unit: 'min', digits: 1 }, { label: 'Round-trip delay', value: 2 * t / 60, unit: 'min', digits: 1 }, { label: 'Signal weaker than at 1 million km by', value: d * d, unit: '×', digits: 0 }]; },
          note: 'Set 0.384 for the Moon, 150 for the Sun, and 4,500 for Neptune. Watch the delay climb to hours.'
        },
        sim: null,
        quiz: [
          { q: 'About how long does a radio signal take to travel from the Moon to Earth?', options: ['About 1.3 seconds', 'About 13 seconds', 'About 13 minutes', 'Instantly'], answer: 0, why: '384,400 km ÷ 300,000 km/s ≈ 1.28 s.' },
          { q: 'If a probe moves twice as far away, the received signal power becomes…', options: ['Half', 'One quarter', 'One eighth', 'The same'], answer: 1, why: 'Power falls with the square of distance: 1/2² = 1/4.' },
          { q: 'Why are Mars rovers given plans rather than driven live?', options: ['They have no wheels', 'Signals take minutes each way, so live control is impossible', 'Radio does not work on Mars', 'It saves money'], answer: 1, why: 'A 10 to 40 minute round trip prevents real-time control.' }
        ]
      },
      {
        id: 'L8-4', title: 'Landing, re-entry and rovers', minutes: 8,
        tagline: 'Getting down safely means burning off huge energy with heat shields, parachutes or rockets.',
        definition: 'Re-entry is a spacecraft’s fast plunge into a planet’s atmosphere, where air compression makes intense heat. A heat shield is a protective layer that survives or carries away this heat. A rover is a wheeled robot that drives on another world.',
        why: 'Landing is often the riskiest part of a mission. Understanding the energy involved explains why heat shields, parachutes and precise rocket burns are needed.',
        explain: [
          'A spacecraft in low Earth orbit carries huge kinetic energy: KE = ½ m v². Per kilogram at 7.8 km/s that is ½ × 7,800² ≈ 30 million joules, about seven times the energy in a kilogram of TNT (4.2 MJ). To land, nearly all of it has to go somewhere.',
          'In an atmosphere, it goes into the air. The capsule is blunt on purpose. A blunt shape creates a strong shock wave in front of it, which pushes most of the hot air away, so most of the heat stays in the air and only a fraction reaches the vehicle. The shield still endures temperatures well above 1,500 °C.',
          'Heat shields come in two main types. Ablative shields char and slowly burn away, carrying heat off with them. Reusable shields use insulating ceramic or silica tiles that soak and radiate heat. Both are made to protect the spacecraft, not to survive unchanged.',
          'Mars has only about 1% of Earth’s air density at the surface. This is too thin to slow a heavy lander with a parachute alone, but thick enough to heat it. So Mars landers use a heat shield, then a parachute, then rocket engines for the last stretch. The Moon has no atmosphere, so every bit of landing must be done with rockets, needing roughly 2 km/s of Δv from low lunar orbit.',
          'A rover is the mobile explorer after landing. Six wheels on a “rocker-bogie” suspension let it climb over rocks. Power comes from solar panels or a radioisotope generator. It drives slowly, around 4 cm per second at best, and uses cameras to avoid hazards on its own because of the signal delay.'
        ],
        keyIdeas: [
          'Orbital re-entry must remove about 30 MJ of energy per kilogram.',
          'Blunt capsules push a shock wave ahead of them, keeping most of the heat away.',
          'Heat shields are ablative (burning away) or reusable tiles.',
          'Mars needs shield + parachute + rockets; the Moon needs rockets only.'
        ],
        equations: [
          { name: 'Kinetic energy', formula: 'KE = ½ × m × v²', vars: [['KE', 'kinetic energy', 'J'], ['m', 'mass', 'kg'], ['v', 'speed', 'm/s']], meaning: 'Double the speed and you must remove four times the energy.' }
        ],
        example: { title: 'Worked example: energy of a returning capsule', text: 'Capsule mass 3,000 kg, speed 7,800 m/s.\nKE = ½ × 3,000 × 7,800² = 0.5 × 3,000 × 6.084×10⁷ = 9.126×10¹⁰ J ≈ 91 GJ.\nOne tonne of TNT holds about 4.184 GJ, so this is roughly 22 tonnes of TNT.\nPer kilogram: 91.3 GJ ÷ 3,000 = 30.4 MJ/kg.\nThe atmosphere absorbs most of it through the shock wave; the heat shield only needs to handle a fraction.' },
        diagram: 'atmosphere',
        mistakes: [
          'Myth: re-entry heat comes from friction with air. Truth: it comes mostly from the air being compressed in front of the vehicle at extreme speed.',
          'Myth: a pointed nose is best for re-entry. Truth: blunt shapes are better because they push the hot shock wave away from the surface.',
          'Myth: Mars’s thin air makes landing easy. Truth: it is too thin for a parachute alone to slow a heavy lander, so it is often even harder than Earth.'
        ],
        recap: 'A returning spacecraft holds about 30 MJ per kilogram of energy that must be shed, mainly into the air through a blunt shape and a heat shield. Mars needs shield, parachute and rockets, the Moon needs rockets only, and rovers explore after landing.',
        lab: {
          title: 'Try it: re-entry energy', intro: 'Enter the entry speed and vehicle mass.',
          inputs: [{ id: 'v', label: 'Entry speed', unit: 'km/s', min: 1, max: 15, step: 0.1, value: 7.8 }, { id: 'm', label: 'Vehicle mass', unit: 'kg', min: 10, max: 100000, step: 10, value: 3000 }],
          compute: (v) => { const sp = v.v * 1000; const perKg = 0.5 * sp * sp; const total = perKg * v.m; return [{ label: 'Energy per kg', value: perKg / 1e6, unit: 'MJ/kg', digits: 1 }, { label: 'Total energy', value: total / 1e9, unit: 'GJ', digits: 1 }, { label: 'Equivalent TNT', value: total / 4.184e9, unit: 'tonnes', digits: 1 }]; },
          note: 'Try 11 km/s, the speed of a capsule returning from the Moon: the energy is about twice that of a low-orbit return.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Build me a lander with a heat shield and parachutes that can land 300 kg on Mars, then run the descent and tell me if it survives.', screen: 'simulation' },
        quiz: [
          { q: 'Why are re-entry capsules blunt rather than pointed?', options: ['They look better', 'A blunt shape pushes the hot shock wave away, so less heat reaches the vehicle', 'They are cheaper', 'They fit the rocket better'], answer: 1, why: 'The shock wave in front carries most of the heat into the air.' },
          { q: 'What must a Moon lander use to slow down?', options: ['A parachute', 'A heat shield only', 'Rocket engines', 'Airbags only'], answer: 2, why: 'The Moon has no atmosphere, so parachutes and shields cannot help.' },
          { q: 'If re-entry speed doubles, the energy per kilogram becomes…', options: ['Twice as big', 'Four times as big', 'Half as big', 'The same'], answer: 1, why: 'KE = ½ m v², so it grows with the square of speed.' }
        ]
      }
    ]
  },
  {
    id: 'L9', n: 9, title: 'Guidance, Navigation & Control', icon: 'target',
    blurb: 'See how a rocket or spacecraft senses where it is, decides where to go, and steers itself there.',
    lessons: [
      {
        id: 'L9-1', title: 'What is GNC? Sensors that tell a vehicle where it is', minutes: 7,
        tagline: 'Navigation asks “where am I?”, guidance asks “where to?”, and control asks “how do I steer?”.',
        definition: 'GNC stands for Guidance, Navigation and Control. Navigation estimates position, speed and orientation. Guidance decides the path to follow. Control commands the engines, fins or wheels to follow it. An IMU (inertial measurement unit) is a box of accelerometers and gyroscopes that measures motion.',
        why: 'A rocket flies too fast and too far away for a person to steer. GNC is the autopilot that keeps it stable and on course, and a bug or a bad sensor can destroy the mission.',
        explain: [
          'Picture driving a car in fog. Navigation is working out where you are (you can see the last road sign). Guidance is deciding to turn left at the next junction. Control is turning the steering wheel and pressing the pedals. Together they form a loop that repeats many times per second.',
          'Sensors feed navigation. An IMU has accelerometers, which feel acceleration, and gyroscopes, which feel rotation. Add up (integrate) acceleration once to get speed, again to get position. It works without any outside signal, which is great, but small errors add up over time.',
          'That is why an IMU drifts. A constant accelerometer error b gives a speed error b × t and a position error ½ × b × t². Because of the t², a tiny error grows fast. So GNC systems correct the IMU using other sensors.',
          'Star trackers are small cameras that photograph the stars, compare them with a stored map, and work out exactly which way the spacecraft is facing, often to within a few arcseconds (an arcsecond is 1/3,600 of a degree). Sun sensors and horizon sensors give coarser but simpler direction checks. Near Earth, GPS receivers give position. Radar altimeters and lidar measure height above the ground for landings.',
          'No sensor is perfect, so designers use several and blend them. The IMU is quick and smooth, while the star tracker or GPS is slow but does not drift. Together they give a much better answer than either one alone. That blending is called sensor fusion.'
        ],
        keyIdeas: [
          'Navigation = where am I; Guidance = where should I go; Control = how do I get there.',
          'An IMU measures acceleration and rotation but drifts over time.',
          'Star trackers, sun sensors, GPS, altimeters and lidar give outside references.',
          'Sensor fusion combines fast-but-drifting sensors with slow-but-accurate ones.'
        ],
        equations: [
          { name: 'Drift from a constant accelerometer bias', formula: 'Δv = b × t   and   Δx = ½ × b × t²', vars: [['b', 'accelerometer bias (constant error)', 'm/s²'], ['t', 'time since last correction', 's'], ['Δv', 'speed error', 'm/s'], ['Δx', 'position error', 'm']], meaning: 'Position error grows with the square of time, so regular corrections are essential.' }
        ],
        example: { title: 'Worked example: IMU drift', text: 'Bias b = 0.001 m/s² (about 0.0001 g, a good-quality accelerometer).\nAfter t = 100 s: Δv = 0.1 m/s, Δx = ½ × 0.001 × 100² = 5 m.\nAfter t = 600 s: Δv = 0.6 m/s, Δx = ½ × 0.001 × 600² = 180 m.\nTime went up 6 times, but position error went up 36 times.\nA star tracker or GPS fix every few minutes keeps the error small.' },
        diagram: 'gnc-loop',
        mistakes: [
          'Myth: GNC is only the steering. Truth: steering is just Control; Navigation and Guidance are equally important.',
          'Myth: the IMU is enough on its own for a long trip. Truth: its errors grow with time, so you must correct it with outside references.',
          'Myth: GPS works everywhere. Truth: GPS satellites serve Earth and near-Earth space; it is useless around Mars or the Moon.'
        ],
        recap: 'GNC senses the state, decides the path, and steers the vehicle. Sensors like the IMU and star tracker work best when fused, because the IMU drifts and outside references fix it.',
        lab: {
          title: 'Try it: how fast does an IMU drift?', intro: 'Pick an accelerometer error and a time since the last correction.',
          inputs: [{ id: 'b', label: 'Accelerometer bias', unit: 'mm/s²', min: 0.01, max: 100, step: 0.01, value: 1 }, { id: 't', label: 'Time', unit: 's', min: 1, max: 3600, step: 1, value: 600 }],
          compute: (v) => { const b = v.b / 1000; return [{ label: 'Speed error', value: b * v.t, unit: 'm/s', digits: 2 }, { label: 'Position error', value: 0.5 * b * v.t * v.t, unit: 'm', digits: 1 }]; },
          note: 'Double the time and the position error becomes four times bigger. Correcting often matters more than a slightly better sensor.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Fly a rocket launch and show me how navigation errors from the IMU would change the final orbit.', screen: 'analysis' },
        quiz: [
          { q: 'Which part of GNC decides the path to follow?', options: ['Navigation', 'Guidance', 'Control', 'Propulsion'], answer: 1, why: 'Guidance chooses where to go; navigation finds where you are; control executes.' },
          { q: 'What does a star tracker measure?', options: ['Speed', 'Fuel level', 'Orientation, by matching star patterns', 'Temperature'], answer: 2, why: 'It photographs stars and matches them to a catalogue to find the pointing direction.' },
          { q: 'A constant accelerometer error is present for 10 seconds, then 20 seconds. How does position error change?', options: ['It doubles', 'It quadruples', 'It stays the same', 'It halves'], answer: 1, why: 'Δx = ½ b t², so doubling t makes the error four times bigger.' }
        ]
      },
      {
        id: 'L9-2', title: 'Control loops and PID', minutes: 8,
        tagline: 'A feedback loop keeps measuring the error and pushing to shrink it.',
        definition: 'Feedback control compares the measured value with the target, finds the error, and adjusts the actuator to reduce it. PID stands for Proportional, Integral, Derivative: three ways of turning the error into a command.',
        why: 'A rocket is naturally unstable, like a broomstick balanced on a finger. Fast feedback control is what keeps it pointing where it should.',
        explain: [
          'Think of a shower. You want 38 °C, you feel 30 °C, so you turn the hot tap up. If you feel 45 °C, you turn it down. The difference between target and reading is the error. Feedback control does exactly this, but hundreds of times each second.',
          'The Proportional part gives a command proportional to the error: u = Kp × e. A big error gives a big push, a small one a gentle push. The gain Kp sets how hard. If Kp is too low the response is lazy. If it is too high the vehicle overshoots and wobbles.',
          'The Derivative part looks at how fast the error is changing: Kd × de/dt. It acts like a brake or shock absorber, calming things down as you close in on the target. Too little damping and you swing back and forth. Too much and everything is slow.',
          'The Integral part adds up the error over time: Ki × ∫e dt. If a small steady error stays (like a constant wind pushing a rocket), the integral keeps growing until the controller fixes it. Too much integral can also cause overshoot.',
          'Together the PID law is u = Kp × e + Ki × ∫e dt + Kd × de/dt. Engineers tune the three gains, first in simulation and then in test. A well-tuned loop reaches the target quickly, overshoots a little or not at all, and stays there.'
        ],
        keyIdeas: [
          'Error = target − measured; control tries to make it zero.',
          'P pushes in proportion to the error; D damps; I removes leftover steady error.',
          'Too much gain causes overshoot and oscillation.',
          'Tuning trades speed against stability.'
        ],
        equations: [
          { name: 'PID control law', formula: 'u = Kp × e + Ki × ∫e dt + Kd × (de/dt)', vars: [['u', 'control command', 'units of actuator'], ['e', 'error (target − measured)', 'same as measurement'], ['Kp, Ki, Kd', 'tuning gains', '–']], meaning: 'The command mixes the present error, the accumulated past error, and the trend of the error.' },
          { name: 'Damping ratio (simple PD model)', formula: 'ζ = Kd ÷ (2 × √Kp)', vars: [['ζ', 'damping ratio', '–'], ['Kp', 'proportional gain', '–'], ['Kd', 'derivative gain', '–']], meaning: 'When ζ is near 1 the motion is smooth with little overshoot; well below 1 it overshoots and rings.' }
        ],
        example: { title: 'Worked example: pitch control', text: 'Target pitch 10°, measured 4°, so e = 6°.\nKp = 2 (N·m per degree): P term = 2 × 6 = 12 N·m.\nThe error is shrinking at 3°/s, so de/dt = −3 °/s. With Kd = 1.5: D term = 1.5 × (−3) = −4.5 N·m.\nIntegral is still zero for now.\nCommand u = 12 − 4.5 = 7.5 N·m. The D term backs off the push because the rocket is already turning the right way quickly.' },
        diagram: 'gnc-loop',
        mistakes: [
          'Myth: a higher gain is always better. Truth: too much gain makes the loop overshoot and can make it unstable.',
          'Myth: PID is the only kind of control. Truth: it is the most common, but modern vehicles also use state-space, optimal and adaptive control.',
          'Myth: the derivative term “predicts the future”. Truth: it only reacts to how fast the error is changing right now, which acts like damping.'
        ],
        recap: 'Feedback control turns the error between target and measurement into a corrective command. PID mixes present, past and trend of the error, and tuning balances speed against stability.',
        lab: {
          title: 'Try it: tune a pointing loop', intro: 'A spacecraft must turn 10°. Set the gains and see overshoot and settling time in a quick simulation.',
          inputs: [{ id: 'kp', label: 'Proportional gain Kp', unit: '', min: 0.1, max: 20, step: 0.1, value: 2 }, { id: 'kd', label: 'Derivative gain Kd', unit: '', min: 0, max: 20, step: 0.1, value: 2 }],
          compute: (v) => {
            const kp = Math.max(v.kp, 0.0001), kd = Math.max(v.kd, 0);
            const target = 10, dt = 0.01, T = 30;
            let th = 0, w = 0, peak = 0, lastOut = 0;
            for (let i = 0; i < T / dt; i++) {
              const e = target - th;
              const u = kp * e - kd * w;
              w += u * dt; th += w * dt;
              if (th > peak) peak = th;
              if (Math.abs(target - th) > 0.02 * target) lastOut = (i + 1) * dt;
            }
            const os = Math.max(0, (peak - target) / target * 100);
            const settle = Math.min(lastOut, T);
            const zeta = kd / (2 * Math.sqrt(kp));
            return [{ label: 'Overshoot', value: os, unit: '%', digits: 1 }, { label: 'Settling time (within 2%)', value: settle, unit: 's', digits: 1 }, { label: 'Damping ratio', value: zeta, unit: '', digits: 2 }];
          },
          note: 'With Kd = 0 the craft swings forever (settling time hits the 30 s limit). Damping ratio near 1 gives a smooth, quick, no-overshoot turn.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Fly a rocket ascent and show me how the pitch controller reacts, including any overshoot in the attitude.', screen: 'analysis' },
        quiz: [
          { q: 'What does the proportional (P) term depend on?', options: ['The total past error', 'The present size of the error', 'The rocket’s mass', 'The rate of fuel burn'], answer: 1, why: 'P gives a command in direct proportion to the current error.' },
          { q: 'What is the derivative (D) term mainly for?', options: ['Adding damping to reduce overshoot', 'Removing steady error', 'Increasing thrust', 'Measuring temperature'], answer: 0, why: 'D reacts to how quickly the error changes and acts as a brake.' },
          { q: 'You raise the proportional gain a lot and the rocket now wobbles back and forth. What happened?', options: ['The gain is too high for the damping', 'The engine is too weak', 'The sensors are perfect', 'The target is too small'], answer: 0, why: 'High gain with too little damping overshoots and oscillates.' }
        ]
      },
      {
        id: 'L9-3', title: 'Steering hardware: thrust vector control and reaction wheels', minutes: 7,
        tagline: 'Tilt the engine, spin a wheel, or fire tiny thrusters: each gives a turning push.',
        definition: 'Thrust vector control (TVC) steers a rocket by tilting (gimbaling) its engine so thrust pushes off-centre. A reaction wheel is a spinning flywheel inside a spacecraft; speeding it up turns the spacecraft the opposite way. Torque is a twisting force.',
        why: 'The controller decides what turn is needed; these actuators (parts that produce the push) make it happen. Their strength limits how quickly a vehicle can turn.',
        explain: [
          'A rocket engine that pushes straight through the centre of mass only pushes the rocket forward. To turn the rocket, you need a torque. With TVC, the engine nozzle swivels by a few degrees. Now the thrust points slightly sideways, at a distance L behind the centre of mass, so it twists the rocket.',
          'The torque is roughly τ = F × L × sin δ, where F is thrust, L is the lever arm from the engine pivot to the centre of mass, and δ is the gimbal angle. Tilting only 3° with a 500 kN engine and a 15 m arm gives about 390 kN·m: enough to steer a large vehicle.',
          'Other ways to steer a rocket are fins (they work only in air), separate small vernier engines, and cold-gas or fuel thrusters called an RCS (reaction control system). In space there is no air, so TVC and RCS are the main tools during powered flight.',
          'Satellites usually use reaction wheels. Angular momentum is conserved (the total spin stays the same). If the motor speeds up the wheel one way, the whole satellite rotates the opposite way. No fuel is used, so it is smooth and precise. For a 100 kg·m² satellite and a 0.01 kg·m² wheel reaching 3,000 rpm (314 rad/s), the satellite rotates at about 0.031 rad/s, or roughly 1.8°/s.',
          'Wheels have a limit. Outside forces like sunlight pressure slowly push more spin into the wheels until they hit maximum speed (saturation). Then the satellite “dumps” the extra spin using magnetorquers (electromagnets pushing against Earth’s field) or thrusters. Control moment gyros are bigger cousins of wheels, used on large stations.'
        ],
        keyIdeas: [
          'TVC creates torque by tilting the engine off the centre-of-mass line.',
          'Torque ≈ thrust × lever arm × sin(gimbal angle).',
          'Reaction wheels change spacecraft orientation without fuel by exchanging angular momentum.',
          'Saturated wheels need desaturating with thrusters or magnetorquers.'
        ],
        equations: [
          { name: 'TVC torque', formula: 'τ = F × L × sin δ', vars: [['τ', 'torque', 'N·m'], ['F', 'engine thrust', 'N'], ['L', 'lever arm to centre of mass', 'm'], ['δ', 'gimbal angle', '°']], meaning: 'A small tilt of a strong engine on a long lever gives a large steering torque.' },
          { name: 'Reaction-wheel momentum exchange', formula: 'I_sc × ω_sc = − I_w × ω_w', vars: [['I_sc', 'spacecraft moment of inertia', 'kg·m²'], ['ω_sc', 'spacecraft turn rate', 'rad/s'], ['I_w', 'wheel moment of inertia', 'kg·m²'], ['ω_w', 'wheel spin rate', 'rad/s']], meaning: 'Spin the wheel one way and the spacecraft turns the other, in proportion to their inertias.' }
        ],
        example: { title: 'Worked example: steering a rocket', text: 'Thrust 500,000 N, gimbal 3°, lever arm 15 m.\nsin 3° = 0.0523.\nτ = 500,000 × 15 × 0.0523 ≈ 392,500 N·m.\nAssume the rocket is a uniform rod: mass 100,000 kg, length 40 m, so I = (1/12) × 100,000 × 40² ≈ 1.33×10⁷ kg·m².\nAngular acceleration = τ ÷ I = 392,500 ÷ 1.33×10⁷ ≈ 0.0295 rad/s² ≈ 1.7°/s².\nSo in 5 seconds it would build up a turn rate of about 8°/s (ignoring fuel slosh and other effects).' },
        diagram: null,
        mistakes: [
          'Myth: rockets turn by pushing against the air. Truth: TVC and thrusters work in vacuum; only fins need air.',
          'Myth: reaction wheels use fuel. Truth: they run on electricity, but they saturate and need desaturating with thrusters or magnetorquers.',
          'Myth: a bigger gimbal angle is always better. Truth: it also wastes forward thrust and can overpower the structure, so angles are limited, often to about 5 to 10°.'
        ],
        recap: 'Rockets steer by tilting the engine so thrust creates a torque, and satellites turn by trading angular momentum with reaction wheels. Both are the muscles that carry out the control loop’s commands.',
        lab: {
          title: 'Try it: engine gimbal steering', intro: 'Set the thrust, gimbal angle, lever arm and rocket inertia to see how quickly it can turn.',
          inputs: [{ id: 'F', label: 'Engine thrust', unit: 'kN', min: 10, max: 8000, step: 10, value: 500 }, { id: 'd', label: 'Gimbal angle', unit: '°', min: 0, max: 10, step: 0.1, value: 3 }, { id: 'L', label: 'Lever arm', unit: 'm', min: 1, max: 50, step: 0.5, value: 15 }, { id: 'I', label: 'Moment of inertia', unit: 'kg·m²', min: 1000, max: 1e9, step: 1000, value: 1.3e7 }],
          compute: (v) => { const tau = v.F * 1000 * v.L * Math.sin(v.d * Math.PI / 180); const alpha = tau / Math.max(v.I, 1); return [{ label: 'Steering torque', value: tau / 1000, unit: 'kN·m', digits: 0 }, { label: 'Angular acceleration', value: alpha * 180 / Math.PI, unit: '°/s²', digits: 2 }]; },
          note: 'Heavier, longer rockets have a big inertia and turn slowly; a small tilt goes a long way when thrust is high.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Build a rocket with a gimbaled engine and fly it, showing how thrust vector control steers the pitch during ascent.', screen: 'simulation' },
        quiz: [
          { q: 'How does thrust vector control turn a rocket?', options: ['By pushing on the air', 'By tilting the engine so thrust creates a torque about the centre of mass', 'By throwing out fuel sideways only', 'By using magnets'], answer: 1, why: 'A tilted thrust line acts off-centre and twists the rocket.' },
          { q: 'A reaction wheel speeds up clockwise. What does the spacecraft do?', options: ['Turns clockwise', 'Turns counter-clockwise', 'Stays still', 'Speeds up forward'], answer: 1, why: 'Angular momentum is conserved, so the body turns the opposite way.' },
          { q: 'What is wheel saturation?', options: ['The wheel is wet', 'The wheel reaches its maximum speed and can absorb no more momentum', 'The wheel breaks', 'The battery is full'], answer: 1, why: 'At maximum spin the wheel can no longer give torque and must be desaturated.' }
        ]
      },
      {
        id: 'L9-4', title: 'Guidance laws and navigation filtering', minutes: 8,
        tagline: 'Guidance picks the path, and a filter blends predictions and measurements to find the best estimate.',
        definition: 'A guidance law is a rule that turns the current state and the goal into a desired direction or acceleration. A Kalman filter is a method that combines a prediction with a noisy measurement, trusting each according to how uncertain it is.',
        why: 'Getting to an exact orbit or a landing spot needs both a good plan and a good estimate of where you truly are. Together they let vehicles hit targets thousands of kilometres away.',
        explain: [
          'Open-loop guidance follows a fixed plan, like a pitch program: tilt by so many degrees at each second. It is simple but cannot cope with surprises such as wind or engine differences. Closed-loop guidance recomputes the path in flight, based on the measured state, and steers to the target.',
          'A gravity turn is a classic. A rocket lifts off vertically, is then tipped a tiny bit, and lets gravity slowly bend the path toward horizontal while thrust stays along the velocity. This keeps sideways forces on the rocket small. Upper stages use closed-loop guidance to reach the exact orbit despite small errors.',
          'Landers use similar ideas: they compute a burn that removes speed and steers toward a landing spot, and repeat it as new measurements arrive. Missiles and some spacecraft use proportional navigation: the commanded turn is proportional to how fast the line of sight to the target is rotating. If it is not rotating, you are on a collision course.',
          'Now the navigation half. A real sensor is noisy, and a prediction from physics drifts. The Kalman filter blends the two. Its update is: new estimate = prediction + K × (measurement − prediction). The gain K = P ÷ (P + R), where P is the variance (uncertainty squared) of the prediction and R is the variance of the measurement.',
          'If the prediction is very uncertain, K approaches 1 and the filter trusts the measurement. If the measurement is very noisy, K approaches 0 and the filter trusts the prediction. After the update, the new variance is (1 − K) × P, always smaller than before. This is how a spacecraft gets precise position from many imperfect readings.'
        ],
        keyIdeas: [
          'Open-loop follows a fixed plan; closed-loop corrects it using measurements.',
          'A gravity turn uses gravity to bend the path so sideways loads stay small.',
          'The Kalman filter weights prediction and measurement by their uncertainty.',
          'Each update makes the estimate more certain than either input.'
        ],
        equations: [
          { name: 'Kalman gain (one dimension)', formula: 'K = P ÷ (P + R)', vars: [['K', 'gain, from 0 to 1', '–'], ['P', 'variance of the prediction (σ²)', 'm²'], ['R', 'variance of the measurement (σ²)', 'm²']], meaning: 'The more uncertain your prediction is compared with the sensor, the more you trust the sensor.' },
          { name: 'Estimate update', formula: 'x_new = x_pred + K × (z − x_pred)', vars: [['x_new', 'updated estimate', 'm'], ['x_pred', 'predicted value', 'm'], ['z', 'measured value', 'm'], ['K', 'Kalman gain', '–']], meaning: 'Move the prediction toward the measurement by a fraction K of the difference.' }
        ],
        example: { title: 'Worked example: one filter step', text: 'Prediction: the lander is at 100.0 m altitude with σ = 2 m, so P = 4 m².\nMeasurement: the radar says 103.0 m with σ = 1 m, so R = 1 m².\nK = 4 ÷ (4 + 1) = 0.8.\nNew estimate = 100 + 0.8 × (103 − 100) = 102.4 m.\nNew variance = (1 − 0.8) × 4 = 0.8 m², so σ ≈ 0.89 m.\nThe result is more accurate than the radar alone (1 m) or the prediction alone (2 m).' },
        diagram: 'gravity-turn',
        mistakes: [
          'Myth: a filter just averages the sensors. Truth: it weights each by how uncertain it is, and it also uses a physics model to predict.',
          'Myth: more sensors always fix everything. Truth: bad models or wrongly estimated noise can still make the estimate worse.',
          'Myth: a rocket steers to a fixed path. Truth: closed-loop guidance recomputes the path during flight to correct for wind, engine differences and errors.'
        ],
        recap: 'Guidance turns the goal into a path, either fixed or recomputed in flight. Navigation filters such as the Kalman filter blend predictions with noisy measurements to give the best possible estimate.',
        lab: {
          title: 'Try it: one Kalman filter update', intro: 'Set how uncertain the prediction and the sensor are, and how far apart they disagree.',
          inputs: [{ id: 'sp', label: 'Prediction uncertainty (σ)', unit: 'm', min: 0.1, max: 100, step: 0.1, value: 2 }, { id: 'sm', label: 'Measurement uncertainty (σ)', unit: 'm', min: 0.1, max: 100, step: 0.1, value: 1 }, { id: 'inn', label: 'Measurement minus prediction', unit: 'm', min: -50, max: 50, step: 0.5, value: 3 }],
          compute: (v) => { const P = v.sp * v.sp, R = v.sm * v.sm; const K = P / (P + R); return [{ label: 'Kalman gain K', value: K, unit: '', digits: 2 }, { label: 'Correction applied', value: K * v.inn, unit: 'm', digits: 2 }, { label: 'New uncertainty (σ)', value: Math.sqrt((1 - K) * P), unit: 'm', digits: 2 }]; },
          note: 'Make the sensor very noisy and K falls toward 0. Make the prediction poor and K rises toward 1. The new σ is always smaller than both inputs.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Launch a rocket with a gravity-turn ascent and show me how guidance corrects the path to reach a 400 km orbit.', screen: 'simulation' },
        quiz: [
          { q: 'What is the main difference between open-loop and closed-loop guidance?', options: ['Open-loop is more accurate', 'Closed-loop updates the path in flight using measurements', 'Open-loop uses more fuel', 'There is no difference'], answer: 1, why: 'Closed-loop feeds back what is measured so it can correct errors.' },
          { q: 'A Kalman filter has a very noisy sensor and a good prediction. What does it do?', options: ['Trust the sensor more', 'Trust the prediction more (K close to 0)', 'Ignore both', 'Use only the sensor'], answer: 1, why: 'K = P/(P+R) is small when R (sensor noise) is large, so the prediction dominates.' },
          { q: 'Prediction variance is 4 m², measurement variance is 1 m². What is K?', options: ['0.2', '0.5', '0.8', '1.0'], answer: 2, why: 'K = 4 ÷ (4 + 1) = 0.8.' }
        ]
      }
    ]
  }
];
