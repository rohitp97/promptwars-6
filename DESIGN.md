# Shaadi Compass — Design Document
### Hack2Skill x Google PromptWars Virtual | Celebration & Event Planner
*"A wedding plan that re-plans."*

---

## 1. The problem we picked (and what we left out)

The brief is wide: weddings, birthdays, community events, budgets, timelines, vendor checklists, ideas.
The organisers' explainer says to **pick one persona and one painful moment** instead of building every
feature, and gives a test: *"A user generates a budget and a timeline, then comes back with a change —
the budget dropped and the event is two weeks earlier. Does your app revise the plan, or does the user
start from scratch?"*

**Persona:** an Indian family planning a wedding (100-300 guests, one to five functions, 3-6 months out,
a budget in lakhs).
**Painful moment:** the plan changes. Budget cut, guests added, date moved, a vendor delays. Everything
is connected, and a static checklist or a chat transcript cannot say what the change *does*.
**Left out on purpose:** guest-list management, invitations/RSVP sending, a vendor marketplace. The
organisers warned against feature sprawl.

## 2. Why not just ask a chat assistant? (the question the organisers will ask)

| A chat assistant | Shaadi Compass |
|---|---|
| Invents prices and states them as fact | Every rupee is tagged **Estimate / Quoted / Your figure**. A *Quoted* price must be found in the text the user pasted |
| "Here are 10 ideas" | One plan whose parts are linked: change guests and food, venue, decor, invites and stay all move |
| Rewrites the plan from scratch on every message | A change is **previewed as a before/after diff**, applied, logged and **undoable** |
| Does date and budget arithmetic in its head | Arithmetic and scheduling are **tested code** |
| Says a vendor is "available" | Never claims availability or confirmed prices. Vendor tools are a *coordinator*: structure quotes, flag what they omit, supply questions to ask |
| Cuts costs evenly or arbitrarily | **Trade-offs are computed**: each option is applied to a copy of the plan and the budget re-run, so the saving shown is the saving you get |

## 3. The core idea: GenAI understands, code decides

The model never edits the plan and never supplies a number the plan depends on.

```
 user words ─► Gemini ─► closed list of operations ─► parseOps() validates ─► preview diff ─► apply
 pasted quote ─► Gemini ─► structured quote ─► checkExtraction() ─► price & inclusions must be in text
 family profile ─► Gemini ─► ideas with rough costs ─► code decides "fits / stretch / over" vs the plan
```

| GenAI (Gemini via Firebase AI Logic) | Deterministic, tested code |
|---|---|
| Understand "20% less and two weeks earlier" and map it to operations | Validate every operation (ranges, dates, ids); reject the rest with a reason |
| Read a WhatsApp/PDF vendor quote into fields | Verify the price and each inclusion appear in the pasted text; drop what does not |
| Personalised ideas for the family's feel, elders, children, must-haves | Cost fit vs the category's allocation; ranges; budget math |
| Phrase questions | Which questions: gaps come from missing fields, not from the model |
| — | Budget model, allocations, trade-off savings, dependency scheduler, `.ics`, diff, undo |

### 3.1 Operations, not edits (`lib/ops.ts`)
The model can only emit: `set_budget`, `adjust_budget_pct`, `set_guests`, `set_event_date`,
`shift_event_days`, `set_city`, `set_priority`, `add_function`, `remove_function`, `mark_task_done`,
`delay_task`. Unknown ops, out-of-range numbers (budget ₹50k-50 Cr, guests 10-2000), past dates and
unknown ids are rejected with a visible reason. **Relative dates are not computed by the model** (it
returns `shift_event_days: -14`); code does the calendar. A jailbroken or confused model therefore
cannot put the plan in a bad state. Tests include an invented `delete_everything` operation.

### 3.2 Honest numbers (`lib/budget.ts`, `lib/quotes.ts`)
- **Estimate**: author-drafted typical cost for city tier × guests × functions, shown as a range
  (0.8x-1.3x). Labelled with its review date. Not vendor prices.
- **Quoted**: only a quote the user marks **Booked** feeds the budget, and at the *top* of the GST
  range when the quote does not state GST. A per-plate catering rate is multiplied by the meals across
  functions unless the user says it covers one meal.
- **Your figure**: a number the user typed.
- The overview states how much of the total is backed by something other than an estimate.

### 3.3 Budget re-planning
`allocate()` shares the budget (minus a 10% reserve) in proportion to typical costs, tilted by the
family's priorities (splurge / standard / lean). When over budget, `buildTradeoffs()` produces options
(trim guests 10/20%, fold a function into another day, drop a splurge to standard, go lean on a
category), each priced by re-running the engine on a modified copy of the plan.

### 3.4 Timeline that re-schedules (`lib/timeline.ts`)
Sixteen task templates with dependencies, durations and "must finish N days before the event". Tasks are
scheduled **forward from today** after their prerequisites. A task is *on track*, *tight* (<7 days
slack), *cannot fit* (earliest possible finish is after its due date, with the number of days short) or
*overdue*. Because everything is recomputed from the plan, moving the date, delaying a task ("venue
visits only after 20 Nov") or finishing one automatically re-plans every dependent task. Function-
specific tasks (mehendi artist, DJ) disappear when the function is removed.

### 3.5 Vendors (`lib/quotes.ts`, `components/VendorsView.tsx`)
Paste a quote → structured card → total for *your* guest count with GST range → verdict against what
the plan allows (within / over / suspiciously low) → "ask before booking" questions derived from fields
the quote does not state (GST, advance, validity, inclusions, exclusions, guest basis). Plus a per-
vendor-type checklist of questions. **Verification:** the extracted price must literally appear among
the amounts in the pasted text, otherwise the quote is refused; each inclusion/exclusion/extra charge
must have ≥60% of its words in the text, otherwise it is removed and listed.

### 3.6 Personalised ideas
Ideas use the family's own words (feel, elders/children, must-haves) and the category's allocation as a
cap. Each idea carries the model's *rough* cost, labelled as such; **fit is decided by code**
(`fits ≤ cap`, `stretch ≤ 1.2x`, `over`). "Too expensive: show cheaper" regenerates cheaper alternatives.
The prompt forbids the model from commenting on fit after a live test showed it contradicting the code.

## 4. Architecture

React 19 + TypeScript + Vite + Tailwind. No backend, **no Firestore**: the plan lives in `localStorage`
only (privacy; the family's finances never reach a server). Gemini is called through **Firebase AI
Logic**, so no API key ships in the bundle. Model failover chain (`lib/ai.ts`) copes with retired and
overloaded models. If AI is not configured the app still works: manual edits, trade-offs, timeline,
checklists and a rule-based change parser all run offline.

```
src/lib    dates money budget tradeoffs timeline quotes ops plan ics fallbackParse   <- tested pure code
           ai prompts aiTasks                                                      <- the only model I/O
src/hooks  usePlan  (single owner of state: commit() -> diff -> change log -> undo)
src/components Setup ChangeBar Overview BudgetView TimelineView VendorsView IdeasView
```

## 5. Security and robustness
- No secrets in the bundle (Firebase AI Logic); direct key honoured in `vite dev` only.
- Strict CSP in `index.html` and `firebase.json`; the dev server drops it (Vite injects inline styles).
- Pasted quote and family text are wrapped in tags and declared data, not instructions; independently,
  model output only ever becomes validated operations or validated structures.
- Corrupt `localStorage` is rejected by `parseSavedPlan`, not trusted.

## 6. Accessibility and UX
Real labels, tabs with roles, `aria-live` for change previews and errors, visible focus, reduced-motion
support, print stylesheet, 375px layout verified. axe-core runs on every screen in tests; palette
contrast is asserted against WCAG AA.

## 7. Honest limitations
- **Cost benchmarks are the author's estimates, not a planner's or vendors' data.** They are labelled,
  dated and shown as ranges. They are the weakest part of the numbers and the first thing to replace.
- Weddings only (the persona is deliberately narrow). Task lead times are the author's judgement.
- GST ranges (5-18%) are an assumption flagged in the UI; the vendor must confirm.
- Live vendor discovery and availability are intentionally absent (the brief says they must be verified).

## 8. For the LinkedIn post: tools and how the prompts evolved
- **Tools:** Claude Code (design, code, tests), Gemini via Firebase AI Logic (runtime), Firebase Hosting.
- **Prompt evolution (so far):** (1) change prompt originally let the model return dates; moved all date
  arithmetic to code via `shift_event_days`. (2) quote prompt originally trusted GST wording loosely; added
  explicit rules for "+ GST"/"inclusive". (3) ideas prompt originally let the model say if an idea fits the
  cap; live test showed it contradicting the code, so the prompt now forbids it.
- **GenAI vs code:** see §3 table.

## 9. Demo video plan (60-90 s)
1. Setup → *Load the example plan* (₹15 L, 200 guests, 4 months). Point at Estimate badges.
2. Over budget → show computed trade-offs → apply "Fold the sangeet" → banner shows what moved → Undo.
3. Type "budget cut by 20% and the wedding is 2 weeks earlier" → preview diff → Apply.
4. Timeline: tasks that no longer fit; tick one; mark venue "delayed" → dependents move.
5. Vendors: paste a caterer quote → verified card, removed invention, GST range → mark Booked → budget line turns **Quoted**.
6. Ideas for Decor → fit labels → "show cheaper".
