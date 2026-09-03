# RPT Governance Platform — implementation

This is a real, working build of the design in `project/RPT Governance Platform.dc.html`
and its chat transcript (`chats/chat1.md`), not a copy of the prototype's markup. Two
apps, backed by a real PostgreSQL database:

- `server/` — Node + TypeScript + Express + PostgreSQL API
- `web/` — React + TypeScript + Vite frontend (the governance console)

## Running it

Postgres (a local cluster is assumed; adjust `DATABASE_URL` for anything else):

```
createuser rpt_app --login --pwprompt   # password: rpt_app (or edit server/.env)
createdb rpt_governance -O rpt_app
```

Backend:

```
cd server
cp .env.example .env
npm install
npm run migrate:up   # creates schemas/tables, seeds the v2026.1 rule set
npm run dev           # http://localhost:4000
```

Frontend:

```
cd web
npm install
npm run dev           # http://localhost:5173, proxies /api to :4000
```

The console ships genuinely empty, per the brief — every case, party and event comes
from Intake.

### Static demo (no backend, no database)

```
cd web
npm install
npm run build:demo
```

Produces one self-contained file, `web/dist-demo/demo.html` — open it directly in a
browser, no server needed. It's the same console UI and business logic (the ratio/gate
engine, screening, decisions, audit chain) running against an in-memory store seeded
with a handful of realistic cases instead of the real API, so `submitCase`/`decideCase`/
etc. all behave like the real thing but nothing persists past a page reload. A "Static
demo · mock data" badge under the logo marks it as such. `vite.demo.config.ts` builds it
by aliasing `api/client.ts` to `api/mock.ts` — every component is unmodified.

## What maps to what

**Database** (`server/migrations/`) implements exactly the schema in the design doc's
"The store" section: `registry.party` / `party_relation`, `intake.rpt_case` /
`rpt_document`, `materiality.rule_set` / `financial_period` / `materiality_evaluation`,
`workflow.approval_step`, `audit.event`. Two invariants from the ADRs are enforced by
Postgres triggers, not just application code, so they hold even against a direct SQL
connection:

- `registry.party_relation` cannot be mutated except `effective_to` / `confirmed_by` /
  `confirmed_at` — a change must close the row and insert a successor.
- `audit.event` cannot be `UPDATE`d or `DELETE`d — the API's `appendEvent` is the only
  writer, and it hash-chains each row per aggregate (`prev_hash` → `hash`).
- `materiality.materiality_evaluation` is immutable once computed — the evaluation
  narrative (`gate_title`/`gate_body`) is stored verbatim at write time rather than
  recomputed from the current rule set, so a decision keeps reading exactly as it did
  the day it was made even after thresholds change later (ADR-03).

**Backend modules** (`server/src/modules/`) mirror the doc's bounded contexts:
`registry`, `intake`, `materiality` (a pure `engine.ts` for the ratio tests and gate,
parameterized by the rule set — nothing hardcodes 0.25%/5%), `workflow`, `audit`. Each
owns its own tables; the one cross-schema read (case list/detail, joining case + party
+ evaluation + decision for the API) lives in `intake/summary.ts` as a presentation
query, not a write path.

**Frontend** (`web/src/console/`) is the console from the `.dc.html`: a nav rail
(Alerts / Intake / Register / Audit / Guidance), rebuilt as real React components
against the live API instead of an in-memory demo array. The Industry design system
(`_ds/industry-*/styles.css`) is ported token-for-token into `web/src/styles/tokens.css`
— same variables, same `.blueprint` corner-mark treatment, same component classes.
Guidance's three-question decision flow and worked examples are intentionally
client-side only, per the design ("these are teaching cases, not records").

The 1180×760 desktop frame and 400px mobile frame in the design were canvas-artboard
constraints of the design tool, not a spec — the real app is one responsive shell that
fills the viewport, matching what "responsive web" (the brief's own answer) means in
production. Below ~560px, two-column field rows stack to one column and the Intake
submit bar sticks to the bottom of the scroll area, matching the design's 1b behavior.

**Register is full CRUD**, beyond what the original design specified (which only had
Intake propose entries for the secretariat to confirm). "Add party" creates a
register row directly, already confirmed — the secretariat administering the register
is a different, more trusted path than Intake's screening proposals. Editing a party's
basis of relationship still goes through `POST /api/parties`'s effective-dating rule
(close the old edge, open a new one), never an in-place update — the DB trigger would
reject that anyway. "Delete" retires the party's active relation (closes it) rather
than deleting rows: `registry.party_relation` is append-only by design, and a past
case keeps a foreign key to the exact relation it was judged against, so a literal
delete would either be rejected by the trigger or invalidate history. Retiring drops
the party off the active register immediately without touching anything a decision
depends on.

## Deliberately out of scope

Called out here so it isn't mistaken for an oversight — none of this was asked for by
the transcript, and the assistant in the original chat explicitly deferred most of it:

- **Auth.** There's no login. `x-actor` header picks a fixed demo persona (`finance` /
  `compliance`); the frontend sends `finance` for submissions and `compliance` for
  decisions, matching the two named actors in the mockup (Faridah, Nurul Aziz).
- **Employee COI declarations, announcement/circular drafting, mandate-headroom
  tracking.** The transcript raised these as "say the word and I'll add" follow-ups;
  the user never asked, and the design itself never implements them either.
- **"Export evidence pack"** on the Audit tab is present but inert, exactly as it was
  in the design (no `onClick` was ever wired up there).
- **Financial-statement parsing.** Upload only hashes and stores the file's metadata;
  the four figures are still keyed by hand, same as the original design ("extraction
  is assistive only").
- **CI-enforced module-boundary linting** (ADR-01 mentions this as the cost of a
  modular monolith) — the boundary is real in the code (each module's repository only
  touches its own schema) but nothing in CI checks it yet.
