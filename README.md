# VanVolt

**Independent campervan electrical design and simulation platform.**

VanVolt helps you design a complete off-grid campervan or motorhome electrical system:
loads, battery bank, solar, inverter, charging sources, cables and fuses. Every change
recalculates live, so you can see how each component affects the rest of the system.

> ⚠️ **Planning tool only.** VanVolt is not a substitute for a competent electrician or
> for verification against the applicable standards (e.g. BS 7671 Section 721 and
> BS EN 1648-2 in the UK, NFPA 1192 in the US). Always check your installation against
> manufacturer instructions and have it inspected.

## Features

- **Consumption calculator**: appliances, wattage, hours, duty cycle and days per week →
  Wh/day, Ah/day, weekly totals, continuous vs peak demand, AC vs DC split.
- **Battery designer**: LiFePO4 and lead-acid (AGM/GEL/flooded), 12/24/48 V, series/parallel
  banks, usable depth of discharge, Peukert effect, autonomy days, cycle-life estimate.
- **Solar designer**: panel selection and quantity, location-based monthly irradiance,
  shading/orientation/temperature/soiling/wiring losses, MPPT vs PWM, summer vs winter.
- **Inverter designer**: continuous and peak requirements, per-appliance compatibility
  checks, DC current at 12/24/48 V.
- **Charging system**: solar, alternator via DC-DC charger or relay, shore power, all
  combined, with checks against battery charge-current limits.
- **Hourly simulation**: state of charge over a chosen month and number of days.
- **Cables and protection**: voltage drop, conductor sizing, ampacity, fuse rating and
  fuse type guidance, with assumptions and limitations shown.
- **Interactive block diagram**: drag-and-drop components with live power flow.
- **Projects**: saved locally in your browser, duplicate, import/export JSON,
  example designs included.
- **Design comparison**: side-by-side comparison of several designs.
- **PDF engineering report**: generated in the browser.
- Dark and light themes, responsive desktop and mobile layouts.

## Quick start

Requirements: **Node.js 20.19 or newer** (22 LTS recommended) and npm.

```bash
git clone https://github.com/SamC567/vanvolt.git
cd vanvolt
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm test` | Run all unit tests (engine + web) |
| `npm run typecheck` | Type-check all packages |
| `npm run build` | Production build into `apps/web/dist` |
| `npm run preview` | Serve the production build at http://localhost:4173 |
| `npm run check` | Typecheck, test and build in one go |

## Documentation

- [Architecture and implementation plan](docs/ARCHITECTURE.md)

## Data and sources

VanVolt distinguishes between **manufacturer data**, **standards / reference data**,
**user inputs**, **engineering assumptions** and **calculated estimates**. Each is labelled
in the interface and in the PDF report, with links to sources.

## Licence

No licence has been chosen yet. Until one is added, all rights are reserved by the
repository owner.
