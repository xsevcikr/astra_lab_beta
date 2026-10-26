// Academy levels L10-L11 (Mission Design, Advanced Aerospace Engineering)
export default [
  {
    id: 'L10', n: 10, title: 'Mission Design', icon: 'flag',
    blurb: 'Learn how engineers turn a big goal into budgets, dates, risks and a real plan, with a Mars mission as the example.',
    lessons: [
      {
        id: 'L10-1',
        title: 'Mission goals, delta-v budgets and launch windows',
        minutes: 8,
        tagline: 'Every mission starts with a goal, then a delta-v budget and a date that nature allows.',
        definition: 'A mission goal is the one clear thing the mission must achieve. A delta-v budget (Δv budget) is the list of all velocity changes the spacecraft must make, added up. A launch window is the period when the planets and orbits line up so the trip is possible.',
        why: 'The goal decides everything else: how big the rocket is, how much fuel it carries, and when it can leave. If you skip the budget or miss the window, the best-built spacecraft still goes nowhere.',
        explain: [
          'Start with a goal written in one sentence, for example: "Land a rover on Mars and look for signs of past water." From this sentence you can work out what you need: a trip to Mars, a safe landing, a rover with the right instruments. If the goal is fuzzy, the design will drift and grow.',
          'Delta-v (Δv) means "change in velocity". It is like the fuel gauge of a trip measured in speed instead of litres. Each step of the journey costs some Δv: getting to low Earth orbit (LEO) costs about 9.4 km/s once air drag and gravity losses are included, leaving LEO for the Moon costs about 3.1 km/s more, braking into lunar orbit about 0.9 km/s, and landing about 1.9 km/s. These are rough typical values.',
          'A Δv budget is just those steps added up, plus a margin. Margin is extra capacity kept in reserve because real flights never match the plan exactly. Engineers often add 5 to 15 percent to Δv for things like navigation errors and small course corrections.',
          'Then comes timing. Planets move, so the cheapest path to Mars only exists when Earth and Mars are in the right places. Time between good chances is the synodic period: how long it takes for one planet to lap the other. For Earth and Mars it is about 780 days, so Mars launch windows open roughly every 26 months.',
          'For the Moon the window is different. The Moon is always nearby, but the launch site must swing under the right orbital plane, so there can be a short window every day. Missing a window means waiting, and waiting costs money.'
        ],
        keyIdeas: [
          'A mission starts with one clear goal sentence.',
          'A Δv budget adds up every burn, then adds margin.',
          'Launch windows come from planet motion, not from the calendar.',
          'Earth to Mars windows repeat about every 26 months.'
        ],
        equations: [
          { name: 'Synodic period', formula: '1 ÷ S = | 1 ÷ T₁ − 1 ÷ T₂ |', vars: [['S','time between alignments','days'],['T₁','orbital period of planet 1','days'],['T₂','orbital period of planet 2','days']], meaning: 'How often two planets line up in the same way depends on the difference of their orbit rates.' }
        ],
        example: { title: 'Worked example', text: 'Find the Earth-Mars synodic period.\nEarth: T₁ = 365.25 days, so 1 ÷ T₁ = 0.002738 per day.\nMars: T₂ = 687 days, so 1 ÷ T₂ = 0.001456 per day.\nDifference = 0.002738 − 0.001456 = 0.001282 per day.\nS = 1 ÷ 0.001282 = about 780 days, which is roughly 2.1 years (26 months).\nSo if you miss a Mars window, the next one is more than two years away.' },
        diagram: 'orbit',
        mistakes: [
          'Thinking Δv is the same as speed. It is a budget of speed changes; a spacecraft can have a high speed and still have no Δv left to spend.',
          'Assuming you can launch to Mars any day. The cheap transfer only works in a window; leaving at other times needs far more Δv.',
          'Adding up Δv and stopping. Without margin, one small error can leave the mission short.'
        ],
        recap: 'A mission begins with a clear goal, a Δv budget with margin, and a launch window set by orbital motion. Miss the window and you wait, sometimes for years.',
        lab: {
          title: 'Build a Moon landing Δv budget',
          intro: 'Change the steps and margin to see the total speed change your rocket must be able to make.',
          inputs: [
            { id: 'ascent', label: 'Launch to LEO (with losses)', unit: 'm/s', min: 8000, max: 10500, step: 50, value: 9400 },
            { id: 'toi', label: 'Leave LEO toward the Moon', unit: 'm/s', min: 2500, max: 4000, step: 50, value: 3100 },
            { id: 'loi', label: 'Brake into lunar orbit', unit: 'm/s', min: 500, max: 1500, step: 25, value: 900 },
            { id: 'land', label: 'Land on the Moon', unit: 'm/s', min: 1500, max: 2500, step: 25, value: 1900 },
            { id: 'margin', label: 'Margin', unit: '%', min: 0, max: 30, step: 1, value: 10 }
          ],
          compute: (v) => {
            const base = v.ascent + v.toi + v.loi + v.land;
            const extra = base * v.margin / 100;
            return [
              { label: 'Sum of all steps', value: base, unit: 'm/s', digits: 0 },
              { label: 'Margin added', value: extra, unit: 'm/s', digits: 0 },
              { label: 'Total Δv budget', value: base + extra, unit: 'm/s', digits: 0 }
            ];
          },
          note: 'Set the margin to 0 and then to 20 percent. Notice how much extra capability your vehicle needs just to be safe.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Plan a transfer from low Earth orbit to Mars and show me the delta-v needed.', screen: 'planner' },
        quiz: [
          { q: 'What is a delta-v budget?', options: ['The cost of the mission in money', 'A list of all velocity changes the spacecraft must make, added up', 'The top speed of the rocket', 'The fuel tank size'], answer: 1, why: 'Δv means change in velocity, and the budget adds up every burn the mission needs, plus margin.' },
          { q: 'About how often do Earth to Mars launch windows open?', options: ['Every week', 'Every 3 months', 'About every 26 months', 'Every 10 years'], answer: 2, why: 'The Earth-Mars synodic period is about 780 days, roughly 26 months.' },
          { q: 'Why add margin to a Δv budget?', options: ['Real flights never match the plan exactly', 'To make the rocket look bigger', 'Because physics requires exactly 10 percent', 'To burn off extra fuel'], answer: 0, why: 'Navigation errors, small corrections and surprises use up some Δv, so a reserve keeps the mission safe.' }
        ]
      },
      {
        id: 'L10-2',
        title: 'Mass budgets and margins',
        minutes: 8,
        tagline: 'Every kilogram counts, and weight always grows, so engineers plan for it.',
        definition: 'A mass budget is a table of the mass of every part of the spacecraft. Mass margin (also called contingency) is extra mass added on purpose to cover parts that grow heavier than first estimated.',
        why: 'Mass and Δv are tied together by the rocket equation, so a small mass increase can force a much bigger rocket. Tracking mass early prevents nasty surprises late in the project.',
        explain: [
          'Imagine packing for a flight with a strict baggage limit. You list each item and its weight. A mass budget does the same for a spacecraft: structure, engines, tanks, batteries, solar panels, computers, instruments and wiring.',
          'Here is the honest problem: early estimates are too low. Parts grow as designers add brackets, cables, bolts and fixes. Almost every real project sees mass growth, so teams add a mass margin. A common early-design habit is 20 to 30 percent, shrinking as parts are built and weighed on a scale.',
          'Why is mass so painful? The rocket equation says Δv = vₑ × ln(m₀ ÷ m_f), where vₑ is exhaust velocity, m₀ is the starting mass with propellant and m_f is the final mass after burning. To get the same Δv, an extra kilogram of dry mass (everything except propellant) needs several extra kilograms of propellant to push it. The growth loops back on itself.',
          'Engineers use three terms. Dry mass is the vehicle without propellant. Wet mass is dry mass plus propellant. Payload is the useful cargo, such as a rover or a satellite. The ratio of payload to wet mass is often small, sometimes only a few percent for a big rocket.',
          'That is why teams track a "mass properties" report all the time, weigh every part they build, and fight for every kilogram. Saving one kilogram of dry mass saves several kilograms of launch mass.'
        ],
        keyIdeas: [
          'A mass budget lists every part and its mass.',
          'Estimates grow, so plan a margin (often 20 to 30 percent early on).',
          'The rocket equation multiplies the cost of extra dry mass.',
          'Dry mass plus propellant equals wet mass.'
        ],
        equations: [
          { name: 'Rocket equation', formula: 'Δv = vₑ × ln(m₀ ÷ m_f)', vars: [['Δv','change in velocity','m/s'],['vₑ','effective exhaust velocity (Isp × 9.81)','m/s'],['m₀','starting mass','kg'],['m_f','final mass','kg']], meaning: 'The more mass you have to push, the more propellant you need to reach the same speed change.' }
        ],
        example: { title: 'Worked example', text: 'A probe estimate: dry mass 1000 kg. Add 20 percent margin: 1000 × 1.2 = 1200 kg.\nGoal Δv = 3000 m/s with Isp = 300 s, so vₑ = 300 × 9.81 = 2943 m/s.\nMass ratio = e^(3000 ÷ 2943) = e^1.019 = about 2.77.\nStarting mass m₀ = 1200 × 2.77 = about 3330 kg.\nPropellant = 3330 − 1200 = about 2130 kg.\nNow the dry mass grows by 100 kg to 1300 kg: m₀ = 1300 × 2.77 = 3600 kg. The 100 kg growth costs about 270 kg more at launch.' },
        diagram: 'rocket-eq',
        mistakes: [
          'Believing margin is wasted mass. It is planned reserve; without it, real mass growth eats into the payload or the Δv.',
          'Thinking payload and dry mass are the same. Dry mass includes the whole vehicle structure and systems, not only the cargo.',
          'Forgetting that saving mass on the last stage or probe saves far more launch mass than the same saving on a first stage booster.'
        ],
        recap: 'A mass budget adds up every part with a margin for growth. Because of the rocket equation, every extra kilogram of dry mass costs several kilograms at launch.',
        lab: {
          title: 'Mass margin and Δv',
          intro: 'See how the margin you carry changes the Δv your propellant can deliver.',
          inputs: [
            { id: 'dry', label: 'Estimated dry mass', unit: 'kg', min: 100, max: 20000, step: 10, value: 1000 },
            { id: 'margin', label: 'Mass margin', unit: '%', min: 0, max: 40, step: 1, value: 20 },
            { id: 'prop', label: 'Propellant loaded', unit: 'kg', min: 100, max: 60000, step: 10, value: 3000 },
            { id: 'isp', label: 'Specific impulse (Isp)', unit: 's', min: 200, max: 460, step: 5, value: 320 }
          ],
          compute: (v) => {
            const dryM = v.dry * (1 + v.margin / 100);
            const m0 = dryM + v.prop;
            const ratio = dryM > 0 ? m0 / dryM : 1;
            const dv = v.isp * 9.80665 * Math.log(ratio);
            return [
              { label: 'Dry mass with margin', value: dryM, unit: 'kg', digits: 0 },
              { label: 'Starting mass', value: m0, unit: 'kg', digits: 0 },
              { label: 'Mass ratio', value: ratio, unit: '', digits: 2 },
              { label: 'Δv available', value: dv, unit: 'm/s', digits: 0 }
            ];
          },
          note: 'Keep propellant fixed and raise the margin. The Δv drops because the same fuel now pushes a heavier vehicle.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Build me a space probe with 1000 kg dry mass and 3000 kg of propellant and tell me its delta-v.', screen: 'designer' },
        quiz: [
          { q: 'What is mass margin?', options: ['Mass of the payload', 'Extra planned mass to cover growth in estimates', 'Mass of the propellant only', 'The mass of the launch pad'], answer: 1, why: 'Margin is a planned reserve because real parts end up heavier than early estimates.' },
          { q: 'Why does 1 extra kg of dry mass cost several kg at launch?', options: ['Because gravity changes', 'Because the rocket equation needs more propellant to push it to the same Δv', 'Because engines get weaker', 'It does not; it costs exactly 1 kg'], answer: 1, why: 'The extra mass has to be accelerated too, and that takes extra propellant, which also has to be accelerated.' },
          { q: 'Dry mass plus propellant is called:', options: ['Payload mass', 'Wet mass', 'Margin', 'Thrust'], answer: 1, why: 'Wet mass is the full loaded mass; dry mass has no propellant.' }
        ]
      },
      {
        id: 'L10-3',
        title: 'Timeline, risk, failure modes and testing',
        minutes: 8,
        tagline: 'Plan the events in order, find what can go wrong, and test before you fly.',
        definition: 'A mission timeline is the ordered list of events from launch to end of mission. A failure mode is a specific way something can fail. Risk is how likely a problem is and how bad the result would be.',
        why: 'Space does not allow repairs, so problems must be found on the ground. Listing failure modes and testing them is how engineers turn "hope it works" into "we have good evidence it works".',
        explain: [
          'A timeline is a script for the whole mission. For a Mars rover it might read: launch, separation from the rocket, cruise, course corrections, entry, landing, first drive. Each event has a time, a required state of the spacecraft, and a plan B if it goes wrong.',
          'Some events are critical, meaning that if they fail, the mission is lost and there is no second try. Rocket ignition, solar panel deployment, engine burns to enter orbit and landing are all critical. Engineers give these extra attention and often add backup systems.',
          'To find dangers, teams list failure modes. For example, a valve could stick open, a computer could reset, a battery could overheat, a parachute could tear. For each one they ask: how likely, how bad, and how can we prevent or survive it? A simple score is risk = likelihood × consequence, with each rated on a scale like 1 to 5. It is a ranking tool, not a physics law.',
          'Success of the whole mission depends on every phase working. If phases are independent, you multiply their success chances. Even four "pretty good" phases give a modest total, which is why each phase needs to be very reliable.',
          'Finally comes testing. Engineers test parts, then assemblies, then the whole vehicle, under shaking, vacuum, heat and cold. The rule is "test as you fly and fly as you test": try to copy real flight conditions as closely as possible. Testing does not prove nothing can fail; it reduces surprises and finds the failures cheaply, on the ground.'
        ],
        keyIdeas: [
          'A timeline orders every event and a backup plan.',
          'Critical events have no second chance.',
          'Risk is likelihood combined with consequence.',
          'Independent phase success chances multiply.'
        ],
        equations: [
          { name: 'Mission success chance (independent phases)', formula: 'P = P₁ × P₂ × P₃ × …', vars: [['P','chance the whole mission succeeds','0 to 1'],['P₁, P₂ …','chance each phase succeeds','0 to 1']], meaning: 'The whole mission works only if every phase works, so the chances multiply and the total is lower than any single phase.' }
        ],
        example: { title: 'Worked example', text: 'Suppose the phases have these estimated success chances:\nLaunch 0.98, cruise 0.99, entry and landing 0.90, surface operations 0.95.\nP = 0.98 × 0.99 × 0.90 × 0.95\n= 0.9702 × 0.90 = 0.8732\n0.8732 × 0.95 = about 0.83.\nSo the mission has roughly an 83 percent chance. The weakest phase, landing, is the best place to spend effort. These numbers are illustrative, not real statistics.' },
        diagram: null,
        mistakes: [
          'Thinking one successful test proves the design is safe. One pass shows it worked once; engineers test at extremes and many times.',
          'Treating every risk equally. Ranking by likelihood and consequence shows where effort pays off most.',
          'Assuming phases are always independent. A shared cause, such as one software bug, can hit several phases at once.'
        ],
        recap: 'A good mission plan orders its events, lists how each could fail, and tests to find problems before flight. Because phase chances multiply, weak phases drag the whole mission down.',
        lab: {
          title: 'Mission success calculator',
          intro: 'Enter the success chance of each phase and see the overall result.',
          inputs: [
            { id: 'launch', label: 'Launch success', unit: '%', min: 50, max: 100, step: 0.5, value: 98 },
            { id: 'cruise', label: 'Cruise success', unit: '%', min: 50, max: 100, step: 0.5, value: 99 },
            { id: 'edl', label: 'Entry and landing success', unit: '%', min: 50, max: 100, step: 0.5, value: 90 },
            { id: 'ops', label: 'Surface operations success', unit: '%', min: 50, max: 100, step: 0.5, value: 95 }
          ],
          compute: (v) => {
            const p = (v.launch / 100) * (v.cruise / 100) * (v.edl / 100) * (v.ops / 100);
            const lowest = Math.min(v.launch, v.cruise, v.edl, v.ops);
            return [
              { label: 'Overall mission success', value: p * 100, unit: '%', digits: 1 },
              { label: 'Weakest single phase', value: lowest, unit: '%', digits: 1 },
              { label: 'Chance something fails', value: (1 - p) * 100, unit: '%', digits: 1 }
            ];
          },
          note: 'Raise the weakest phase by 5 points and compare that with raising the strongest phase. Fixing the weak link helps most.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Run a launch of my rocket and explain any failure modes you find.', screen: 'analysis' },
        quiz: [
          { q: 'What is a failure mode?', options: ['The time the rocket lands', 'A specific way a part or system can fail', 'The launch pad location', 'A type of fuel'], answer: 1, why: 'A failure mode is a defined way something can go wrong, such as a stuck valve.' },
          { q: 'Four independent phases each succeed 90 percent of the time. About what is the overall chance?', options: ['90 percent', '81 percent', '66 percent', '36 percent'], answer: 2, why: '0.9 × 0.9 × 0.9 × 0.9 = 0.656, about 66 percent.' },
          { q: 'What does "test as you fly" mean?', options: ['Only test during a real flight', 'Copy real flight conditions as closely as possible in testing', 'Skip ground tests', 'Test only once'], answer: 1, why: 'Tests are most useful when they resemble the real mission environment and procedures.' }
        ]
      },
      {
        id: 'L10-4',
        title: 'Example: a Mars rover mission',
        minutes: 9,
        tagline: 'Follow a Mars rover from launch through cruise, entry, descent and landing to driving.',
        definition: 'Entry, descent and landing (EDL) is the sequence that takes a spacecraft from the top of a planet\'s atmosphere to a safe touchdown on the surface. Cruise is the coast between planets.',
        why: 'A Mars mission uses every idea in mission design at once: goals, Δv, windows, mass, timeline and risk. It is also a great example of why landing is the hardest part.',
        explain: [
          'Launch: the rocket lifts the spacecraft and gives it enough energy to leave Earth on a path toward Mars. This must happen inside the launch window, which opens about every 26 months. The trip then takes roughly 6 to 9 months.',
          'Cruise: the spacecraft coasts, mostly with its engines off. It makes small trajectory correction maneuvers (TCMs), which are short burns to fix its path, using only a little Δv. Cruise stages also provide power, cooling and radio link, and are thrown away before entry.',
          'Entry, descent and landing: the capsule hits the thin Martian atmosphere at roughly 5 to 6 km/s. A heat shield takes the heat and a lot of the speed. A parachute opens while the capsule is still going faster than sound, then the shield drops off. Mars air is under 1 percent as thick as Earth air at the surface, so the parachute alone cannot slow the vehicle enough. Rocket engines finish the job; the recent large rovers used a "sky crane" to lower the rover on cables.',
          'Why is it so hard? Radio signals take roughly 3 to 22 minutes one way, depending on where Earth and Mars are. The whole EDL takes only about 7 minutes, so it is finished before Earth even hears that it started. The spacecraft must do everything by itself, following its stored plan and sensors.',
          'Surface phase: the rover checks itself, then drives, drills and studies rocks. Power comes from solar panels or a radioisotope power source, and the team on Earth sends commands once per Mars day (a sol, about 24 hours 37 minutes). Planning follows the goal: instruments and landing site are chosen to answer the science question.'
        ],
        keyIdeas: [
          'Mars trips are timed by launch windows and last about 6 to 9 months.',
          'Cruise uses small burns to fix the path.',
          'EDL relies on heat shield, parachute and rockets because the air is so thin.',
          'Signal delay means the spacecraft must land itself.'
        ],
        equations: [
          { name: 'Signal delay', formula: 't = d ÷ c', vars: [['t','one-way signal time','s'],['d','distance','km'],['c','speed of light (about 299 792)','km/s']], meaning: 'Radio waves travel at the speed of light, which is fast but not instant across space.' }
        ],
        example: { title: 'Worked example', text: 'Earth and Mars are 225 million km apart.\nt = d ÷ c = 225 000 000 ÷ 299 792 = about 750 s.\n750 s ÷ 60 = 12.5 minutes one way.\nA command and its reply take about 25 minutes round trip.\nSince EDL lasts around 7 minutes, no human can steer the landing live.' },
        diagram: 'hohmann',
        mistakes: [
          'Thinking Mars is easy to land on because the air is thin. Thin air is the problem: it is thick enough to cause heating but too thin for a parachute alone.',
          'Believing engineers can drive the landing by joystick. The signal delay makes that impossible.',
          'Thinking the rover flies to Mars alone. It travels inside a capsule with a cruise stage, and much of that is discarded.'
        ],
        recap: 'A Mars mission has four big phases: launch in a window, cruise with small corrections, an automatic seven-minute EDL, and then months or years of surface work. Landing is the hardest part because of thin air and radio delay.',
        lab: {
          title: 'Earth-Mars radio delay',
          intro: 'Pick a distance between the planets to see how long a signal takes.',
          inputs: [
            { id: 'dist', label: 'Earth-Mars distance', unit: 'million km', min: 55, max: 400, step: 5, value: 225 }
          ],
          compute: (v) => {
            const t = (v.dist * 1e6) / 299792.458;
            return [
              { label: 'One-way delay', value: t / 60, unit: 'minutes', digits: 1 },
              { label: 'Round-trip delay', value: (2 * t) / 60, unit: 'minutes', digits: 1 }
            ];
          },
          note: 'Try 55 million km (very close) and then 400 million km (near the far side of the Sun). Compare both to the roughly 7-minute EDL.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Build me a Mars lander carrying a small rover.', screen: 'designer' },
        quiz: [
          { q: 'About how long does a typical Earth to Mars trip take?', options: ['3 days', '3 weeks', 'About 6 to 9 months', 'About 5 years'], answer: 2, why: 'Transfer orbits that use little fuel take roughly 6 to 9 months.' },
          { q: 'Why must a Mars lander handle EDL automatically?', options: ['Humans are not allowed to help', 'Signals take minutes to arrive and EDL only lasts about 7 minutes', 'Mars has no radio waves', 'It has no computer'], answer: 1, why: 'The one-way delay can be longer than the whole landing, so commands from Earth arrive too late.' },
          { q: 'Why is the parachute not enough on Mars?', options: ['The air is very thin, so it gives too little drag', 'Mars has no gravity', 'Parachutes do not open in air', 'The air is thicker than on Earth'], answer: 0, why: 'Mars surface pressure is under 1 percent of Earth, so extra braking is needed from rocket engines.' }
        ]
      }
    ]
  },
  {
    id: 'L11', n: 11, title: 'Advanced Aerospace Engineering', icon: 'academy',
    blurb: 'See how professionals make decisions, manage reliability and uncertainty, prove designs work, and how you can join them.',
    lessons: [
      {
        id: 'L11-1',
        title: 'Systems engineering and trade studies',
        minutes: 8,
        tagline: 'Systems engineering keeps thousands of parts working together, and trade studies pick between options.',
        definition: 'Systems engineering is the discipline of making all parts of a complex vehicle work together to meet its requirements. A trade study compares design options against criteria to choose the best compromise.',
        why: 'A rocket is not one machine; it is engines, tanks, software, structure and people all affecting each other. Without systems thinking, a change in one place quietly breaks another.',
        explain: [
          'A requirement is a clear statement of what the system must do, such as "deliver 500 kg to orbit" or "survive 4 g of acceleration". Requirements come from the mission goal, then flow downward: the rocket needs a certain thrust, so the engine needs a certain chamber pressure, and so on. Good requirements can be measured and tested.',
          'Everything is linked. A bigger engine gives more thrust but weighs more, uses more fuel, and shakes the structure harder. Systems engineers watch these links. They also manage interfaces, the places where two parts meet, such as a bolt pattern, an electrical connector or a data format.',
          'Design is full of trade-offs. A trade study lists options, chooses criteria such as performance, cost and risk, gives each criterion a weight for its importance, scores each option, and adds up. Example: choose between a liquid engine and a solid motor for a small launcher.',
          'The scoring method is simple but the discussion is valuable. It forces the team to say what matters and why. The result should be checked with a "what if" test: change the weights a little and see if the winner changes. If it flips easily, the options are close, and more data is needed.',
          'Real programs also go through formal reviews at set stages. Early reviews check the requirements and concept; later ones check detailed design, then readiness to build and fly. The names vary between organizations, but the pattern is the same: agree, design, build, test, fly.'
        ],
        keyIdeas: [
          'Requirements are measurable statements of what the system must do.',
          'Interfaces are where parts meet, and where problems hide.',
          'Trade studies use weighted criteria to compare options.',
          'Check if the winner changes when the weights change.'
        ],
        equations: [
          { name: 'Weighted score', formula: 'Score = Σ (weight × rating) ÷ Σ weight', vars: [['weight','importance of a criterion','0 to 10'],['rating','how well the option does on it','0 to 10'],['Σ','sum over all criteria','']], meaning: 'Each rating counts more if its criterion matters more; dividing by total weight keeps scores on the same 0 to 10 scale.' }
        ],
        example: { title: 'Worked example', text: 'Weights: performance 5, cost 3, risk 2 (total 10).\nOption A (liquid engine): performance 9, cost 5, risk 6.\nScore A = (5×9 + 3×5 + 2×6) ÷ 10 = (45 + 15 + 12) ÷ 10 = 7.2.\nOption B (solid motor): performance 6, cost 8, risk 8.\nScore B = (5×6 + 3×8 + 2×8) ÷ 10 = (30 + 24 + 16) ÷ 10 = 7.0.\nA wins, but only by 0.2. If cost weight rises to 5 and performance falls to 3, B wins. The choice depends on what the team values.' },
        diagram: null,
        mistakes: [
          'Thinking the highest score is automatically correct. Scores depend on the weights and ratings people chose; test them.',
          'Optimizing one part alone. The best engine on its own may hurt the whole vehicle.',
          'Writing vague requirements like "very reliable". A requirement must be measurable, such as "success probability of at least 0.95".'
        ],
        recap: 'Systems engineering keeps requirements, interfaces and parts consistent across the whole vehicle. Trade studies use weighted scoring to compare options, but the answer is only as good as the weights and ratings behind it.',
        lab: {
          title: 'Trade study scorer',
          intro: 'Set how much each criterion matters and rate two options from 0 to 10.',
          inputs: [
            { id: 'wp', label: 'Weight: performance', unit: '', min: 0, max: 10, step: 1, value: 5 },
            { id: 'wc', label: 'Weight: cost', unit: '', min: 0, max: 10, step: 1, value: 3 },
            { id: 'wr', label: 'Weight: risk (low is good)', unit: '', min: 0, max: 10, step: 1, value: 2 },
            { id: 'ap', label: 'Option A performance', unit: '', min: 0, max: 10, step: 1, value: 9 },
            { id: 'ac', label: 'Option A cost rating', unit: '', min: 0, max: 10, step: 1, value: 5 },
            { id: 'ar', label: 'Option A risk rating', unit: '', min: 0, max: 10, step: 1, value: 6 },
            { id: 'bp', label: 'Option B performance', unit: '', min: 0, max: 10, step: 1, value: 6 },
            { id: 'bc', label: 'Option B cost rating', unit: '', min: 0, max: 10, step: 1, value: 8 },
            { id: 'br', label: 'Option B risk rating', unit: '', min: 0, max: 10, step: 1, value: 8 }
          ],
          compute: (v) => {
            const wt = v.wp + v.wc + v.wr;
            const a = wt > 0 ? (v.wp * v.ap + v.wc * v.ac + v.wr * v.ar) / wt : 0;
            const b = wt > 0 ? (v.wp * v.bp + v.wc * v.bc + v.wr * v.br) / wt : 0;
            return [
              { label: 'Option A score', value: a, unit: '/ 10', digits: 2 },
              { label: 'Option B score', value: b, unit: '/ 10', digits: 2 },
              { label: 'Gap (A minus B)', value: a - b, unit: '', digits: 2 }
            ];
          },
          note: 'Raise the cost weight step by step. Find the point where the winner flips: that tells you how sensitive the decision is.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Design two versions of a small satellite launcher, one bigger and one cheaper, and compare them.', screen: 'designer' },
        quiz: [
          { q: 'What is an interface in systems engineering?', options: ['A computer screen', 'The place where two parts or systems meet and must fit or communicate', 'A type of engine', 'A test report'], answer: 1, why: 'Interfaces include mechanical fits, electrical connections and data formats.' },
          { q: 'In a trade study, what does a weight represent?', options: ['The mass of an option', 'How important a criterion is', 'The cost in kg', 'The number of engineers'], answer: 1, why: 'Weights say which criteria matter most to the decision.' },
          { q: 'Two options score 7.2 and 7.0. What is the sensible next step?', options: ['Declare the winner with no more thought', 'Check how the result changes if the weights or ratings change', 'Flip a coin and hide the scores', 'Throw away both'], answer: 1, why: 'A small gap means the choice is sensitive and needs a closer look.' }
        ]
      },
      {
        id: 'L11-2',
        title: 'Reliability, redundancy and fault protection',
        minutes: 8,
        tagline: 'Add backups and self-protection, but remember that backups share the same weaknesses.',
        definition: 'Reliability is the chance that a system does its job for a given time. Redundancy means having extra units that can take over. Fault protection is software and hardware that detect a problem and put the spacecraft in a safe state.',
        why: 'Nobody can fix a spacecraft in deep space. Redundancy and fault protection are how a mission survives a broken part, but they cost mass and add complexity, so they must be used wisely.',
        explain: [
          'Reliability is expressed as a probability. A part that works 95 times out of 100 has a reliability of 0.95. In a series system, where every part is needed, you multiply reliabilities, so the total is lower than any part. A parallel system, with backups, needs only one working unit.',
          'The parallel formula is R = 1 − (1 − r)ⁿ. With one unit at r = 0.95 the failure chance is 5 percent. With two independent units, both must fail: 0.05 × 0.05 = 0.0025, so R = 0.9975. With three, failure drops to 0.000125. That is a huge improvement, and it shows why critical systems get backups.',
          'The catch is the word "independent". If both units share the same design flaw, the same software bug, the same power supply or the same hit from debris, they can fail together. This is called a common-cause failure. Real reliability gains are smaller than the ideal formula, and engineers reduce common-cause risk with different suppliers, separated locations and sometimes different designs or software.',
          'Another approach is voting. With three computers doing the same calculation, a voter takes the majority answer; if one computer gives a wrong result, the other two outvote it. Crewed vehicles have used sets of redundant computers, sometimes with an independent backup written separately.',
          'Fault protection watches for trouble. A watchdog timer resets the computer if it stops responding. If something serious happens, the spacecraft enters safe mode: it turns off nonessential loads, points its solar panels at the Sun, keeps a radio link listening, and waits for instructions. Safe mode is not failure; it is the spacecraft protecting itself until people can fix the cause.'
        ],
        keyIdeas: [
          'Series parts multiply reliabilities; parallel backups reduce failure chance.',
          'Redundancy adds mass, cost and complexity.',
          'Common-cause failures can defeat backups.',
          'Safe mode protects a spacecraft until help arrives.'
        ],
        equations: [
          { name: 'Parallel redundancy', formula: 'R = 1 − (1 − r)ⁿ', vars: [['R','reliability of the whole group','0 to 1'],['r','reliability of one unit','0 to 1'],['n','number of identical independent units','count']], meaning: 'The group fails only if all units fail at once, so each backup multiplies the failure chance by another (1 − r).' }
        ],
        example: { title: 'Worked example', text: 'One flight computer has r = 0.95.\nOne unit: failure = 1 − 0.95 = 0.05 (5 percent).\nTwo units: failure = 0.05² = 0.0025 (0.25 percent).\nThree units: failure = 0.05³ = 0.000125 (0.0125 percent).\nNow suppose 10 percent of failures are common-cause (a shared bug that hits both). Two-unit failure is about 0.10 × 0.05 + (0.9 × 0.05)² = 0.005 + 0.002 = 0.007, so about 0.7 percent, nearly three times worse than the ideal 0.25 percent.' },
        diagram: null,
        mistakes: [
          'Assuming two backups always mean twice as safe. Reliability improves by multiplying failure chances only if failures are independent.',
          'Thinking safe mode means the mission is lost. It is a designed protective state, and many spacecraft recover from it.',
          'Adding redundancy everywhere. Each backup adds mass and can itself add new failure paths, so it belongs on critical, single-point-of-failure items.'
        ],
        recap: 'Backups multiply down failure chances, but only when failures are independent, so engineers fight common-cause faults. Fault protection lets a spacecraft protect itself when something goes wrong.',
        lab: {
          title: 'Redundancy and common-cause failures',
          intro: 'Set the reliability of one unit, the number of backups and the share of failures that hit all units together.',
          inputs: [
            { id: 'r', label: 'Single-unit reliability', unit: '%', min: 50, max: 99.9, step: 0.1, value: 95 },
            { id: 'n', label: 'Number of identical units', unit: '', min: 1, max: 6, step: 1, value: 2 },
            { id: 'beta', label: 'Share of failures that are common-cause', unit: '%', min: 0, max: 30, step: 1, value: 10 }
          ],
          compute: (v) => {
            const q = 1 - v.r / 100;
            const b = v.beta / 100;
            const ideal = Math.pow(q, v.n);
            const real = v.n > 1 ? b * q + Math.pow((1 - b) * q, v.n) : q;
            return [
              { label: 'Failure chance, one unit', value: q * 100, unit: '%', digits: 3 },
              { label: 'Failure chance, ideal backups', value: ideal * 100, unit: '%', digits: 4 },
              { label: 'Failure chance with common-cause', value: real * 100, unit: '%', digits: 4 },
              { label: 'Group reliability with common-cause', value: (1 - real) * 100, unit: '%', digits: 3 }
            ];
          },
          note: 'Raise the common-cause share and watch the benefit of extra units shrink. Adding a third unit barely helps once shared faults dominate.'
        },
        sim: null,
        quiz: [
          { q: 'Two independent units each have reliability 0.9 in parallel. What is the group reliability?', options: ['0.81', '0.90', '0.99', '1.00'], answer: 2, why: 'Failure = 0.1 × 0.1 = 0.01, so reliability is 0.99.' },
          { q: 'What is a common-cause failure?', options: ['A failure that everyone expects', 'One event or flaw that disables several units at once', 'A failure of the launch pad', 'A planned shutdown'], answer: 1, why: 'A shared bug or shared power fault can defeat redundancy.' },
          { q: 'What does a spacecraft do in safe mode?', options: ['Self-destructs', 'Turns off nonessential loads, keeps power and radio link, and waits for instructions', 'Continues the mission unchanged', 'Turns off everything including the radio'], answer: 1, why: 'Safe mode protects the spacecraft and keeps a way for engineers to talk to it.' }
        ]
      },
      {
        id: 'L11-3',
        title: 'Uncertainty, Monte Carlo and structural safety factors',
        minutes: 9,
        tagline: 'Nothing is known exactly, so engineers run many random trials and build in strength margins.',
        definition: 'Uncertainty is how much a real value may differ from the number we used. A Monte Carlo simulation runs a model thousands of times with random small variations. A factor of safety is how much stronger a structure is designed to be than the loads it should see.',
        why: 'Real rockets meet gusts of wind, engines that are slightly stronger or weaker, and metal that is slightly off spec. Testing all of this ahead of time shows how often a design would succeed, and safety factors keep structures from breaking under unexpected loads.',
        explain: [
          'Suppose you calculate one perfect flight. It says the rocket reaches orbit. But engine thrust could be 1 percent low, the wind could be stronger and the mass could be 20 kg heavier. One perfect run does not tell you what happens when several of these happen together.',
          'Monte Carlo simulation solves this. The computer runs the flight thousands of times. Each run picks random values for each uncertain input from a realistic range. Counting how many runs succeed gives an estimate of the success chance and shows which inputs cause trouble. The name comes from casino gambling, because of the randomness.',
          'Monte Carlo has limits. It only covers uncertainties that you thought of and modeled, so a missing failure mode is invisible. To measure a rare event, you need many runs: if failure happens 1 in 1,000 times, 100 runs will usually show none. And the answer has its own error, which shrinks as the number of runs grows.',
          'Now structures. A load is a force on a part. Limit load is the largest load expected in service. A factor of safety (FS) multiplies it so the part is designed to carry more than expected. Aerospace factors are usually lower than in everyday construction because mass matters so much: roughly 1.25 to 1.5 is typical for aircraft, rockets and spacecraft, depending on the type of vehicle and the rules used.',
          'Engineers also compute the margin of safety, MS = (strength ÷ (FS × applied load)) − 1. A positive MS means the part meets the requirement; zero means it just meets it; negative means it fails the requirement. Stress is force divided by area, σ = F ÷ A, and comparing it to the material yield strength (where it starts to permanently bend) shows how close the part is.'
        ],
        keyIdeas: [
          'Monte Carlo runs many random trials to estimate success chance.',
          'Rare events need many runs to see.',
          'Factor of safety builds strength above the expected load.',
          'Margin of safety above zero means the part meets the requirement.'
        ],
        equations: [
          { name: 'Stress', formula: 'σ = F ÷ A', vars: [['σ','stress','Pa (N/m²) or MPa'],['F','force on the part','N'],['A','cross-section area','m² or mm²']], meaning: 'The same force is harder on a thin part than on a thick one.' },
          { name: 'Margin of safety', formula: 'MS = strength ÷ (FS × load) − 1', vars: [['MS','margin of safety','no unit'],['strength','allowable load or stress','same unit as load'],['FS','factor of safety','no unit'],['load','limit load or stress','same unit']], meaning: 'How much strength is left after applying the safety factor; above 0 is good.' }
        ],
        example: { title: 'Worked example', text: 'A strut carries a limit load of 50 kN. Its area is 400 mm², yield strength 276 MPa (a common aluminum alloy).\nStress = 50 000 N ÷ 400 mm² = 125 MPa.\nWith FS = 1.25, design stress = 125 × 1.25 = 156 MPa.\nMS = 276 ÷ 156.25 − 1 = about 0.77.\nMS is positive, so the strut passes with room to spare; a lighter strut could be considered. \nMonte Carlo check: 10 000 simulated flights, 9 700 succeed. Estimate = 97 percent. The one-standard-error is about √(0.97 × 0.03 ÷ 10 000) = 0.17 percent.' },
        diagram: null,
        mistakes: [
          'Thinking a safety factor of 1.5 means the part will survive 1.5 times any load. It applies to the load defined in the requirements; an unexpected event can exceed that.',
          'Trusting a Monte Carlo result as the whole truth. It is only as good as the model and the uncertainties put into it.',
          'Using more mass for a bigger safety factor without limit. Extra margin adds weight, and weight costs Δv.'
        ],
        recap: 'Monte Carlo simulations reveal how a design behaves when many small uncertainties combine, and safety factors give structures strength above expected loads. Both are honest ways of saying "we do not know exactly".',
        lab: {
          title: 'Strut margin of safety',
          intro: 'Change the load, size and safety factor to see if the part passes.',
          inputs: [
            { id: 'load', label: 'Limit load', unit: 'kN', min: 1, max: 500, step: 1, value: 50 },
            { id: 'area', label: 'Cross-section area', unit: 'mm²', min: 50, max: 5000, step: 10, value: 400 },
            { id: 'yield', label: 'Yield strength', unit: 'MPa', min: 100, max: 1200, step: 10, value: 276 },
            { id: 'fs', label: 'Factor of safety', unit: '', min: 1, max: 3, step: 0.05, value: 1.25 }
          ],
          compute: (v) => {
            const stress = v.area > 0 ? (v.load * 1000) / v.area : 0;
            const design = stress * v.fs;
            const ms = design > 0 ? v.yield / design - 1 : 0;
            return [
              { label: 'Stress at limit load', value: stress, unit: 'MPa', digits: 1 },
              { label: 'Stress with safety factor', value: design, unit: 'MPa', digits: 1 },
              { label: 'Margin of safety', value: ms, unit: '', digits: 2 }
            ];
          },
          note: 'Reduce the area until the margin goes below zero. That is the point where the part no longer meets the requirement.'
        },
        sim: { label: 'Show me in the simulator', ask: 'Run my rocket launch 20 times with small random variations in thrust and wind, and tell me how often it succeeds.', screen: 'analysis' },
        quiz: [
          { q: 'What does Monte Carlo simulation do?', options: ['Runs a model many times with random variations to see the range of outcomes', 'Builds the rocket', 'Removes all uncertainty', 'Measures the exact thrust'], answer: 0, why: 'Random repeated trials show how often things succeed and which inputs matter.' },
          { q: 'A strut has MS = −0.1. What does that mean?', options: ['It has a comfortable margin', 'It does not meet the requirement and needs to be stronger', 'It weighs less than zero', 'It is perfect'], answer: 1, why: 'A negative margin of safety means strength is below the required level.' },
          { q: 'Why are aerospace safety factors relatively low?', options: ['Engineers do not care about safety', 'Extra structure adds mass, which is very costly for flight', 'Metal is stronger in space', 'Laws forbid larger factors'], answer: 1, why: 'Mass is expensive, so designers use careful analysis and testing instead of huge margins.' }
        ]
      },
      {
        id: 'L11-4',
        title: 'Verification, testing real rockets, and your path in',
        minutes: 9,
        tagline: 'Prove it on the ground first, and here is how you can join the people who do it.',
        definition: 'Verification asks "did we build it right?", meaning it meets its requirements. Validation asks "did we build the right thing?", meaning it meets the real need. Qualification testing shows a design can handle flight conditions with margin.',
        why: 'Rockets are expensive and space is unforgiving, so proving the design on the ground and in stages is how programs reduce risk. Knowing this process also shows you how careers in the field are built.',
        explain: [
          'Verification uses four main methods: inspection (look at it), analysis (calculate or simulate it), demonstration (operate it) and test (measure it under conditions). Each requirement is linked to at least one method and the result is recorded. Validation happens with the customer or user: does the finished system really solve the problem?',
          'Real programs test in steps, from small to large. First materials and parts, then components such as valves and pumps, then subsystems such as an engine, then the whole vehicle. Engines are fired on a test stand (a static fire), often many times, sometimes until they fail on purpose to learn the limits.',
          'Spacecraft go through environmental tests. Vibration and acoustic tests copy the shaking of launch. Thermal-vacuum chambers cycle hot and cold in near-empty space conditions. Qualification units are tested above expected flight levels; flight units are then tested to acceptance levels that check workmanship without wearing them out. Parachutes are dropped from aircraft or rocket sleds, and landing systems get repeated drop tests.',
          'Some teams use fast, iterative testing: build, test, break, learn, rebuild. Others do fewer, more heavily analyzed tests. Both styles are used in the real world and each has costs. Flight tests of prototypes, such as low hops and suborbital flights, are common before a first full mission. A failed test that teaches something is a useful result, but the lesson has to be recorded and acted on.',
          'How do you get here? Common degrees are aerospace, mechanical, electrical, physics and computer science. Careers include structures, propulsion, guidance and controls, thermal, software, mission operations and test. To start now: learn physics and math (calculus especially), practice programming (Python is very popular), try free tools for orbits and 3D design, join a rocketry or CubeSat club, enter student competitions, read public technical papers and free university course notes, and build small things. Keep a project log: employers and universities like seeing what you built and learned.'
        ],
        keyIdeas: [
          'Verification checks against requirements; validation checks against real need.',
          'Testing goes from parts to systems, from small to large.',
          'Qualification tests exceed flight levels; acceptance tests check each flight unit.',
          'You can start learning now with math, programming and small projects.'
        ],
        equations: [],
        example: { title: 'Worked example', text: 'Requirement: "The tank shall hold 4 bar pressure without leaking."\nAnalysis: stress calculations show it can hold 6 bar before yielding.\nQualification test: fill with water (a proof test) to 1.25 × 4 = 5 bar and check for leaks and permanent bulging.\nResult: no leaks, no deformation, so the requirement is verified by test.\nValidation later asks a different question: is 4 bar the right pressure for the engine we actually flew? If the engine really needs 5 bar, the tank passed verification but the design is not valid.' },
        diagram: null,
        mistakes: [
          'Confusing verification with validation. A part can perfectly meet a wrong requirement.',
          'Thinking one failed test means the program is failing. Tests on the ground exist to find failures cheaply.',
          'Believing you need a huge lab to start. Programming, simulation, model rockets and clubs are all doable with modest tools.'
        ],
        recap: 'Programs prove designs step by step with inspection, analysis, demonstration and test, using qualification and acceptance testing before flight. You can begin building the skills today with math, coding and hands-on projects.',
        lab: null,
        sim: { label: 'Show me in the simulator', ask: 'Test my rocket design on the ground in the simulator and tell me what should be checked before flight.', screen: 'analysis' },
        quiz: [
          { q: 'What is the difference between verification and validation?', options: ['There is none', 'Verification: built it right; validation: built the right thing', 'Verification is for software only', 'Validation is done before design'], answer: 1, why: 'Verification checks against requirements; validation checks against the real need.' },
          { q: 'What is a static fire test?', options: ['Firing an engine on a test stand while the vehicle is held down', 'A fireworks show', 'A launch to orbit', 'A software test'], answer: 0, why: 'A static fire runs the engine while fixed to the ground so data can be collected safely.' },
          { q: 'Which is a good way to start an aerospace path as a high-school student?', options: ['Wait until university', 'Learn math and programming and join a rocketry or CubeSat club', 'Only read news', 'Avoid physics'], answer: 1, why: 'Skills and hands-on projects build a real foundation and show your interest.' }
        ]
      }
    ]
  }
];
