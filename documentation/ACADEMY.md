# Aerospace Academy

Open **Academy** in the sidebar. Everything works offline. Your progress (finished lessons, best quiz scores) is stored with your app settings.

## Levels

1. Aerospace Fundamentals  2. Newtonian Mechanics  3. Rocket Fundamentals  4. Propulsion  5. Aerodynamics  6. Flight Dynamics
7. Orbital Mechanics  8. Spacecraft Engineering  9. Guidance, Navigation and Control  10. Mission Design  11. Advanced Aerospace Engineering

44 lessons in total. Every lesson starts with a **Key idea** box (one sentence). Then come the one-sentence definition, three short paragraphs (sentences of about 9 words on average) and a picture. Levels 7-11 are written in plain words in `data/academy/plain.js`; the original long text is kept as `lesson.deep` and shown under *Go deeper* (opened by default in Advanced mode). Each lesson has: a one-sentence definition, why it matters, a plain explanation with everyday analogies, key ideas, a diagram where it helps, the equations with every variable and unit (folded away in Beginner mode: *Show the math*), a worked example with real numbers, an interactive experiment (sliders that recompute the physics formula live; 41 of the 44 lessons have one), common mistakes, a summary and a 3-question quiz. Passing (2 of 3) marks the lesson finished. Quiz answers are shuffled deterministically so the right answer is not always in the same place.

## Build guides

Academy > *Build guides* has one guide for each ready-made vehicle of `data/templates.js`: sounding rocket, small satellite launcher, bigger launcher, space probe, small satellite, Moon lander, lander with rover, rover, plus *fix a rocket that fails*. A step is one short sentence, a *What this does* line (from the parts guide) and a button. The button really edits your project through the same tool API as the AI Helper (`ui/lib/guideactions.js`), so every step can be undone (*Undo last change*, or Ctrl+Z). Steps tick themselves when the project shows they are done. *Load the finished one* loads the matching ready-made vehicle. `tests/guides.test.js` performs every step of every guide, undoes and redoes one, validates the result and flies it in the real simulator; a guide may only say "flown: reaches orbit" when that run met the goal. Open a guide from other screens with `app.navigate('academy', { guide: 'rover' })`, or the list with `{ view: 'guides' }`.

## Glossary

168 words in plain language (`data/academy/glossary.js`, `glossaryLookup(term)`), with an A-Z bar and search. In lessons, parts pages and guides, known words are dotted: tap one to see the plain explanation and a *Learn more* link (`annotate()` in `ui/lib/glossary.js`).

## Parts guide

All 30 component kinds of the Vehicle Designer (engine, tanks, RCS, nose cone, fairing, interstage, structure, fins, heat shield, avionics, guidance, computer, reaction wheels, battery, solar panel, antenna, instrument, payload, sensor, radiator, heater, insulation, landing legs, parachute, rover chassis, wheels, motor). The list has a search box and group filters; each card shows what the part does in two lines, how many ready-made versions the catalogue holds and *Learn more*. Each page explains what it does, how it works, why it matters for the whole vehicle, advantages, limitations, what every editable number means, a suggested experiment and related parts and lessons. In the Vehicle Designer the same text appears as *What is this?* for the selected part.

## Connection to the simulator

* Every lesson has *See it in the simulator*: watch your rocket fly live, open the rocket builder, or ask the AI Helper to teach the topic.
* The AI Helper understands “Teach me about <topic>”, “What does the <part> do?”, “How does a <part> work?” and answers from the Academy, with a button that opens the lesson or part page.

## Honesty notes

* The lessons are written for high-school level and simplified on purpose; they are general aerospace knowledge, not results from your simulation. The AI labels its teaching answers accordingly.
* Numbers in worked examples and experiments are computed by the formulas shown; they are typical values, not specifications of any real vehicle.
* The 44 lessons and the parts guide were checked automatically (structure, quizzes, every experiment returns finite numbers at default and extreme inputs, several formulas were compared with textbook values) but were not reviewed by a professional educator.
