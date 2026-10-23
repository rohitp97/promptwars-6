# Shaadi Compass

**A wedding plan that re-plans.** Built for Hack2Skill x Google PromptWars Virtual, *Celebration & Event
Planner*. Change the budget, guest count or date and the budget, timeline and vendor checks update, with a
plain-language list of exactly what moved. Every rupee is labelled **Estimate**, **Quoted** or **Your figure**.

Design, trade-offs and honest limitations are in [DESIGN.md](DESIGN.md).

## The brief, and where it lives

| Brief asks for | Feature |
|---|---|
| Budgets | Budget model per category, 10% reserve, priorities, computed trade-offs when over budget |
| Timelines | 16-task dependency schedule recomputed from today; "cannot fit" / "tight" / "overdue"; `.ics` export |
| Vendor checklists | Per-vendor-type question checklist; pasted quotes read, verified against the text and compared to the plan |
| Personalised ideas | Ideas from the family's own words, with code-checked cost fit and a "show cheaper" loop |
| Adapts to change (explainer) | Natural-language change → validated operations → before/after preview → apply → undo |
| Honest about estimates (explainer) | Provenance badges; ranges; confidence share; no availability claims |

## Run it

```bash
npm install
npm run dev
```

Without any configuration the app works offline: manual edits, trade-offs, timeline, checklists and a
rule-based change parser. Add AI by copying `.env.example` to `.env`:

- **Recommended:** the Firebase web config (Firebase AI Logic calls Gemini through your project, so no
  Gemini key is shipped in the browser bundle).
- **Local dev only:** `VITE_GEMINI_API_KEY`. Production builds ignore it unless `VITE_ALLOW_CLIENT_KEY=true`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (CSP meta dropped in dev only) |
| `npm test` | Vitest: engine, operations validator, quote verification, UI flows, axe-core, WCAG contrast |
| `npm run lint` | oxlint |
| `npm run build` | Type-check and production build |
| `npm run deploy` | Build and deploy to Firebase Hosting (needs `.firebaserc`, see `.firebaserc.example`) |

## Privacy

The plan is stored only in the browser (`localStorage`). There is no database. Text you type or paste is
sent to Gemini through Firebase AI Logic only when you use a change, quote or idea feature.

## Limits to know about

Cost benchmarks are the author's estimates for planning, not vendor prices and not reviewed by a wedding
planner (`src/data/benchmarks.ts`, dated). GST on vendor quotes is assumed at 5-18% when unstated. The app
never claims a vendor is available or a price is confirmed.
