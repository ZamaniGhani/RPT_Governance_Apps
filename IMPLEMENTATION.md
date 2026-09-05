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
from Intake. Sign in with the seeded dummy account:

```
username: admin
password: Admin@2026
```

This account's department is `admin`, which bypasses every department check below —
it's a placeholder for initial testing, not a real user. Add real accounts from the
**Users** tab once signed in as admin (see "User directory and account management"
below) rather than inserting rows by hand.

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
by aliasing `api/client.ts` to `api/mock.ts` — every component is unmodified. The same
`admin` / `Admin@2026` credential signs in here too, checked client-side against a
hardcoded account list in `mock.ts` — there is no real security in the demo build, same
as everywhere else in that file.

## Login and department access control

There's a real login now: `auth.account` (bcrypt password hashes) and `auth.session`
(opaque tokens in an httpOnly cookie, 12-hour expiry) in a new `auth` schema. Every
mutating route is behind `requireAuth`, and `shared/actor.ts` — which every module
already called to attribute writes and audit events — now derives the `Actor` from the
signed-in session's account instead of a client-supplied header. That one seam meant no
other module's code changed: `actorFromRequest(req)` still returns the same
`{id, role}` shape, it just no longer trusts the caller to say who they are.

Four departments gate specific actions (`requireDepartment` middleware; `admin` bypasses
all of them):

| Department | Can do |
| --- | --- |
| `finance` | Submit a transaction in Intake, upload financial documents |
| `compliance` | Approve / reject / refer / reopen a case in Alerts |
| `secretariat` | Create, edit or remove a Register entry |
| `admin` | All of the above — for initial setup, not day-to-day use |

The frontend mirrors this visibly rather than only failing silently on the server:
Intake shows a blocking notice instead of the form for a non-Finance account, Alerts
shows the case's evaluation but hides the decision buttons for a non-Compliance
account, and Register renders read-only (no "Add party", no Edit/Delete column) for
anyone but Secretariat. This is "control by department" in the sense the request
asked for — the server-side check is still the real boundary; the UI just doesn't make
someone hunt for a 403 to learn they can't do something.

For monitoring, every sign-in, failed sign-in attempt, and sign-out is written into the
same `audit.event` log as case activity (`LoginSucceeded` / `LoginFailed` / `LoggedOut`),
hash-chained the same way — the Audit tab is the usage-monitoring view, not a separate
page. A failed attempt logs the attempted username but no password, and is attributed to
`system` rather than an account, since no account was proven to exist yet.

The department → permission table above is also shown in the product itself, not just
here: on the Login screen (so anyone signing in can see what their department will let
them do before they even authenticate) and again on the Users tab behind a "What each
department can do" disclosure (so an admin has it in view while deciding what
department to put a new hire in). Both render the same `DEPARTMENT_OPTIONS` constant in
`web/src/api/types.ts` through one shared `<DepartmentRoles>` component, so the two
places can never drift out of sync with each other.

### User directory and account management

A new **Users** tab (`web/src/console/tabs/Users.tsx`) lists every account with console
access — name, email, department and last sign-in — for the monitoring the login work
was originally asked to provide, now extended to accounts themselves rather than just
activity. It's visible to every signed-in department (seeing who has access is itself
part of "monitoring the use of the app"), but only an `admin` account gets the "+ Add
user" button and the per-row "Remove" action; everyone else sees the same table
read-only with a note explaining why.

Backend support lives in the `auth` module alongside login/logout, since it's the same
`auth.account` table:

- `GET /api/users` — any signed-in account.
- `POST /api/users` — `admin` only. Validates with zod (username ≥3 chars, password
  ≥8 chars, a real email address, a valid department), pre-checks for a username/email
  clash before hashing the password (`bcrypt`, same cost factor as login), and appends a
  `UserCreated` audit event naming who added whom to which department.
- `DELETE /api/users/:id` — `admin` only, with two guards even an admin can't bypass:
  you can't remove the account you're currently signed in as, and the last remaining
  `admin` account can't be removed (there would be no one left who could add another
  one back). A removal deletes the account's sessions first, then the account row itself
  — a real delete, not a soft "retire" like Register, because unlike a party relation
  nothing else holds a foreign key to an account and audit events already reference the
  actor by a text label, not by ID (see below), so nothing about history depends on the
  row still existing. A `UserRemoved` audit event is appended before the delete so the
  removal itself is the last thing the audit chain remembers about that account.

Migration `1700000006000_auth-users.js` adds the `email` column (backfilling the seeded
admin with a placeholder address) and a unique constraint on it alongside the existing
one on `username`. The static demo (`api/mock.ts`) implements the identical rules
(admin-only mutations, self-delete and last-admin guards, username/email uniqueness)
against an in-memory roster seeded with eleven accounts across all four departments, so
"Users" behaves the same whether you're clicking through the live app or the demo.

## Closing the RPT-practice gaps

A company-secretary review of this build against real Bursa Malaysia MMLR Chapter 10
practice (not just the original design brief) found several places where the app's own
copy claimed a control that the code didn't actually implement, or implemented a rule
that doesn't match the real Listing Requirements. Four of those are fixed:

**A single, real 5% gate, not a fictional 0.25%/5% two-tier one.** The seeded rule set
had a lower "0.25% → announce only, no shareholder approval" band invented for the
original design brief. Real Chapter 10 Part III puts immediate announcement AND the
circular/shareholder-approval requirement at the *same* 5% percentage-ratio threshold
for a one-off (or non-ordinary-course-recurring) RPT — there is no separate lower band.
Migration `1700000007000_materiality-single-threshold.js` retires the old rule set
(`MMLR-CH10 v2026.1`) and inserts `MMLR-CH10 v2026.2` with one `materialThreshold: 5`.
Consistent with ADR-03, this only changes how transactions submitted from now on are
gated — nothing about a case already evaluated under v2026.1 is rewritten; its stored
gate title/body still reads exactly as it did the day it was decided.

**The register's "unconfirmed → secretariat confirms" step is now reachable.** The
repository function that flips a proposed party relation to Confirmed
(`confirmRelation`) existed but no route ever called it, so an Intake-proposed party sat
"Unconfirmed" forever with no way to change that short of editing its basis of
relationship as a side effect. `POST /api/parties/:id/confirm` (secretariat/admin, an
idempotent no-op if already confirmed) and a "Confirm" button on Unconfirmed rows in
Register close that gap, with a `PartyRelationConfirmed` audit event.

**A circular-gate approval needs two different people, and everyone attests they're not
conflicted.** The Alerts screen used to say "interested parties are excluded
automatically; quorum is recomputed without them" — nothing backed that claim. Now:
every decision (approve, reject, or refer) requires the deciding user to tick a
confirmation that they are not a related party to the transaction and have no interest
in it, logged with the decision (`workflow.approval_step.conflict_confirmed`); and a
case at the circular gate isn't treated as approved after one click — the first approval
is held on the case (`intake.rpt_case.pending_approver_*`) and a second, *different*
Compliance or Admin account has to approve it before status flips to `decided` (reject
and refer stay single-sign-off, since either one halts the transaction rather than
letting it proceed). This is real maker-checker, not full board/Audit-Committee
modelling — the app still doesn't know who your actual directors and shareholders are —
but it's an honest control instead of an unbacked claim.

**A rejected transaction no longer inflates the next one's aggregation.** The rolling
twelve-month aggregate for a related party was summing every `rpt_case` regardless of
outcome, so a rejected (never-consummated) transaction was still pulling later
transactions with the same party towards the 5% gate. `priorConsiderationTotal` now
excludes a case whose latest recorded decision is a rejection
(`workflow.approval_step.decision_key`, added by the same migration).

Real gaps that remain, called out so they aren't mistaken for solved: the RRPT
shareholder-mandate mechanism is still a classification label with no estimated/actual
headroom tracking or 10%-over-estimate announcement trigger; related-party
identification is still a flat basis label with no shareholding-chain or
deemed-interest logic; there's no arm's-length/normal-commercial-terms field anywhere;
financial basis defaults to "unaudited" regardless of what was actually relied on;
uploaded supporting documents are hashed but not retained; and the export is a raw case
list, not the annual-report-style disclosure table grouped by related party and nature
of transaction. See the review that produced this list for the full account.

## Board dashboard

A **Board** tab (first in the rail) gives directors a periodic oversight read distinct
from Alerts' operational queue — it's read-only for every department, same as Audit and
Users, since seeing it is itself the point. Nothing here has its own API: it's entirely
derived, client-side, from data the other tabs already fetch (`web/src/console/tabs/Board.tsx`),
so there was no schema or backend change to ship it.

- **KPI strip** — RPTs and value this year, open/decided split, how many sit at the
  circular gate, how many are mid maker-checker awaiting a second sign-off.
- **Threshold watchlist** — every related party ranked by their current rolling
  12-month aggregate percentage, reusing the same ratio-bar visual as Intake, with the
  5% gate line marked. This is the one genuinely predictive widget: it surfaces a party
  approaching the gate before the transaction that tips them over is even submitted,
  rather than only after the fact.
- **Awaiting the Board** — every open case at the circular gate, with its maker-checker
  state (no sign-off yet / one of two, and by whom).
- **Register health** — how many related parties are still Unconfirmed, and the oldest
  one, now that confirming is an actual action (see above).
- **Control environment** — failed logins, accounts added/removed in a selectable
  window (30/90/365 days), and the current headcount with access.
- **Recent circular-gate decisions** — the last five, with both signers named, for
  cross-referencing against board minutes.

Deliberately excluded from the first cut: it's a live-computed read labelled "as of
now," not a point-in-time snapshot pinned to an actual board meeting date — a real
snapshot (so the numbers a board saw on a given date stay fixed even as new
transactions come in) would need its own stored-snapshot table and is a reasonable
future addition, not built here. It's also visible to every department rather than
gated to a distinct "director" role, since the app has no such role today and adding
one only to view a report seemed like more schema than the ask warranted.

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
parameterized by the rule set — nothing hardcodes the 5% figure), `workflow`, `audit`. Each
owns its own tables; the one cross-schema read (case list/detail, joining case + party
+ evaluation + decision for the API) lives in `intake/summary.ts` as a presentation
query, not a write path.

**Frontend** (`web/src/console/`) is the console from the `.dc.html`: a nav rail
(Alerts / Intake / Register / Audit / Guidance), rebuilt as real React components
against the live API instead of an in-memory demo array. Guidance's three-question
decision flow and worked examples are intentionally client-side only, per the design
("these are teaching cases, not records").

## Visual design system

The console's look was redesigned from the original design handoff's monochrome
"Industry" (blueprint drafting) system to a premium SaaS look — indigo/violet on
white, soft gradients, large radii, layered shadows — without touching any route,
API, permission check, or business rule. Everything lives in `web/src/styles/tokens.css`
(color/type/spacing/radius/shadow tokens, base component classes: `.btn`, `.input`,
`.card`, `.tag`, `.table`, `.dialog`, plus new `.alert`, `.skeleton`, `.spinner` and
`.glass` utilities) and `web/src/styles/console.css` (the app-shell and per-tab layout
classes). `Blueprint.tsx` itself is unchanged — the old corner-mark treatment is
retired purely in CSS (`.blueprint > .corner { display: none }`), so the component
still wraps every card and primary button exactly as before, it just renders as a
rounded, shadowed surface instead of a hairline frame with crosshair corners.

Status is now color-coded consistently with the brief's semantic palette: gate
severity tags and the materiality panel (record/announce/circular → slate/amber/rose),
decision outcomes in Alerts (approve/reject/refer → emerald/rose/amber), and Register
entry status (Confirmed/Unconfirmed → emerald/amber). Loading states that used to
`return null` while a tab's first fetch was in flight (Alerts, Register, Audit) now
show a skeleton placeholder instead of a blank pane, and form errors render in a
proper `.alert-error` box rather than a stray line of red text.

Fixing this also caught and fixed two small pre-existing mobile bugs, unrelated to
the visual change but found while re-testing every tab at 390px width: the Intake and
Guidance side-by-side panels could overflow horizontally on narrow viewports because
CSS grid items don't shrink below their content's natural width by default
(`min-width: 0` was missing on the grid item wrappers), and the "what submitting
writes" row in Intake could do the same because a long unbroken table name
(`materiality.materiality_evaluation`) had nowhere to wrap.

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

- **Self-service account features.** Admins can add and remove accounts from the Users
  tab (see above), but there's still no sign-up flow, "forgot password", or a way for a
  user to change their own password or email — an admin has to remove and re-add an
  account to change anything about it beyond its department, which nothing currently
  lets you edit either.
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
