# The AI aerospace engineer

## Principle

The engineer never touches the simulator's internals. Everything goes through the **tool API** (`ai/toolapi.js`), a structured JSON interface with argument validation. The UI screens use the same API for Run, Save and Experiments, so there is exactly one implementation of every operation.

## The 20 core tools

`CREATE_VEHICLE`, `ADD_COMPONENT`, `REMOVE_COMPONENT`, `MODIFY_COMPONENT`, `CREATE_STAGE`, `MODIFY_STAGE`, `ADD_PAYLOAD`, `CREATE_PROBE`, `CREATE_ROVER`, `CREATE_LANDER`, `CREATE_MISSION`, `MODIFY_MISSION`, `RUN_SIMULATION`, `STOP_SIMULATION`, `READ_TELEMETRY`, `ANALYZE_RESULTS`, `COMPARE_SIMULATIONS`, `SAVE_PROJECT`, `LOAD_PROJECT`, `CREATE_EXPERIMENT`.

Plus read-only helpers: `DESCRIBE_VEHICLE`, `LIST_CATALOG`, `UNDO`, `REDO`, and (new in 1.1) `RUN_MONTE_CARLO` (reliability study; not a design change, so it runs without approval). Schemas: `ai/toolspec.js` (JSON-schema style; used both for validation and for the function-calling definitions sent to online models).

## Safety

* Arguments are validated against the schema before execution (types, ranges, enums, required fields). Unknown tools, unknown fields such as `__proto__`, path traversal and wrong types are refused without side effects (tested).
* Requests for shell commands, file deletion, installs, network access or secrets are not turned into actions (tested).
* **Design changes are never applied silently.** They become a *proposal* (a plan of tool calls) that is dry-run on a copy of the project, shown with its expected effect, and applied only after you **Approve**. You can **Edit** the steps or **Cancel**. An approved plan is one undo step; if a step fails the whole plan is rolled back.
* Undo, redo and a version list restore exact earlier design states.
* Read-only actions (simulate, analyse, compare, export) run immediately.

## Truthfulness

* Simulation results, failure causes, evidence and numbers come from recorded telemetry and the failure detector. Before any run exists, the engineer says so instead of inventing results ("Test it" first).
* Estimates are labelled as estimates ("design delta-v", "expected"). A design is never called successful before a simulation says so.
* Failure diagnoses carry a confidence: **CONFIRMED** (measured directly), **LIKELY** (strong inference), **POSSIBLE** (one plausible explanation).
* "Fix it" proposes a change based on the diagnosed root cause (for example propellant for a delta-v shortfall, sized with the rocket equation and the real mass model), re-flies after approval and shows the before/after comparison. "Fix it and keep trying until it works" authorises up to three bounded iterations.

## Offline engineer

Works without internet: natural-language understanding by rules (quantities, vehicle types, stages, orbit altitudes, intents), a design generator that sizes stages with the rocket equation and real component data, an analyser, a fix planner and a knowledge base for explanations ("What is Max-Q?"). Type `help` for the list of things it understands. It is deliberately limited: if it does not understand a request it says so instead of guessing.

## Online model (optional)

*Settings → AI engineer*. Supported wire formats: **Anthropic Messages API** and **OpenAI-compatible chat completions** (including local servers). The model receives the tool definitions and a compact project summary and may call tools; results go back to it. It cannot bypass validation or approval. If the service fails or the key is wrong, the offline engineer answers instead and says so.

* API keys are never hard-coded (a test scans the source tree). In the desktop app the key is stored with Windows DPAPI through Electron `safeStorage`, outside the projects folder. In browser mode it is kept in memory only.
* The renderer cannot make arbitrary network requests: AI calls go through the main process, which allows only `https://` (or `http://localhost`) and blocks redirects to other schemes.
