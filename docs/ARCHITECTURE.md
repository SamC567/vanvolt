# VanVolt architecture and implementation plan

## Goals

VanVolt is a browser-based planning tool for campervan / motorhome off-grid electrical
systems. Priorities, in order:

1. **Reliable calculations**: a pure, unit-tested engine that the interface can't affect.
2. **Transparency**: every number is tagged as manufacturer data, standard/reference data,
   user input, engineering assumption, or calculated estimate. Sources are linked.
3. **Type safety and maintainability**: strict TypeScript end to end.
4. **Local-first**: no server, no account, no recurring cost. Projects are stored in the
   browser and can be exported/imported as JSON.
5. **Fast**: everything recalculates live on each edit (the engine runs in a few ms).

## Technology stack

| Concern  | Choice                                              | Why                                              |
| -------- | --------------------------------------------------- | ------------------------------------------------ |
| Language | TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) | Type safety across engine and UI                 |
| Monorepo | npm workspaces                                      | No extra tooling for users to install            |
| Engine   | Plain TS, zero runtime deps (`packages/engine`)     | Testable, portable, UI-independent               |
| Tests    | Vitest                                              | Fast, TS-native                                  |
| UI       | React 19 + Vite 7 (`apps/web`)                      | Mature ecosystem, fast dev server                |
| Styling  | Tailwind CSS 3 + CSS variables                      | Consistent design tokens, dark/light themes      |
| Charts   | Recharts 3                                          | Declarative, interactive SVG charts              |
| Diagram  | React Flow (`@xyflow/react`)                        | Drag-and-drop node graph with custom nodes/edges |
| State    | Zustand + `persist` (localStorage)                  | Small, typed, built-in persistence               |
| PDF      | jsPDF + jspdf-autotable                             | Client-side vector PDF reports, no server        |

## Repository layout

```
vanvolt/
├── packages/engine/          # Calculation engine (no UI code)
│   ├── src/
│   │   ├── types.ts          # Domain model (Design, Appliance, Battery…)
│   │   ├── units.ts          # Numeric helpers
│   │   ├── consumption.ts    # Loads → Wh/day, Ah/day, continuous & peak demand
│   │   ├── battery.ts        # Bank sizing, usable capacity, autonomy, Peukert, cycle life
│   │   ├── solar.ts          # PV yield by month, losses, controller checks
│   │   ├── inverter.ts       # Sizing, load compatibility, DC currents
│   │   ├── charging.ts       # Alternator/DC-DC, shore, solar; monthly balance
│   │   ├── cables.ts         # Voltage drop, ampacity, conductor & fuse selection
│   │   ├── simulation.ts     # Hourly state-of-charge simulation
│   │   ├── voltage.ts        # 12 V vs 24 V vs 48 V comparison
│   │   ├── analysis.ts       # Aggregates everything into a SystemAnalysis
│   │   ├── compare.ts        # Multi-design comparison metrics
│   │   ├── defaults.ts       # Factory for new designs
│   │   └── data/             # Researched reference data with sources
│   └── test/                 # Unit tests for every critical calculation
├── apps/web/                 # React application
│   └── src/
│       ├── store/            # Zustand store, persistence, migrations
│       ├── pages/            # One page per designer module
│       ├── components/       # UI building blocks, charts, diagram
│       └── report/           # PDF report generator
├── examples/                 # Example designs (JSON, importable)
└── docs/                     # Architecture, calculations, sources, assumptions
```

## Data flow

```
 user edits ──► Zustand store (Design JSON) ──► engine.analyseDesign(design)
                     │                                  │
                     ▼                                  ▼
             localStorage persist               SystemAnalysis (memoised)
                                                        │
                    pages / charts / diagram / PDF ◄────┘
```

The UI never computes electrical values itself; it only renders engine output.
`analyseDesign` is a pure function of the `Design` object, so results are
reproducible and easy to test.

## Provenance model

Every library item carries `provenance` (`manufacturer`, `standard`, `user`,
`assumption`, `estimate`, `calculated`) and an optional `source` (title + URL). When a user
edits a library-sourced value, the UI flips its provenance to `user`. The
analysis returns a list of `assumptions` and `findings` (info / warning / critical)
that the UI and PDF report display verbatim.

## Implementation milestones

| #   | Milestone                          | Done when                                                                 |
| --- | ---------------------------------- | ------------------------------------------------------------------------- |
| M0  | Scaffold, tooling, docs skeleton   | `npm install` works; first commit pushed                                  |
| M1  | Calculation engine and unit tests  | All engine modules implemented; tests green                               |
| M2  | Researched reference data          | Component library, appliances, irradiance, cable tables with source links |
| M3  | Web UI core                        | Shell, themes, persistence, projects, all designer pages live             |
| M4  | Diagram, comparison, PDF, examples | Interactive diagram, compare view, PDF export, example designs            |
| M5  | Verification and docs              | Browser checks, code review, final docs                                   |

Each milestone: run tests → fix → verify UI → update docs → commit → push.
