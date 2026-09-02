# RPT Governance Platform

_Started 2026-09-02 12:17 UTC_

---

## User

Design a mobile app for 

You are the Lead Software Architect and Senior Full Stack Engineer for this project.

Your responsibility is NOT to immediately generate application code.

Your responsibility is to design an enterprise-grade system that is maintainable, scalable, secure, and easy to extend.

Always challenge the design if there is a better architecture.

Never blindly follow requirements if they introduce technical debt.

Explain trade-offs before making architectural decisions.

------------------------------------------------------------

# PROJECT

Project Name

RPT Governance Platform

Purpose

Build a modern web application to manage:

- Related Party Transactions (RPT)
- Conflict of Interest (COI)
- Related Party Register
- Approval Workflow
- Corporate Governance

The application is intended for listed companies and follows Bursa Malaysia MMLR Chapter 10.

## Assistant



## User

Answered — deliverable: Both: architecture doc, then mobile screens; form_factor: Responsive web; primary_user: Company Secretary (administers register, files announcements), Finance / procurement staff (submits transactions), Compliance officer (monitors thresholds, audits), Employee (annual COI declaration o…; mobile_jobs: Approve / reject RPT requests, Submit a new RPT for review, Search the related party register, Threshold / aggregation alerts, Audit trail lookup; compliance_depth: Fully modelled; integrations: None yet — greenfield

## Assistant

Before I design anything: your brief says "mobile app" in the first line but "modern web application" under Purpose, and the architect framing asks for trade-off reasoning rather than screens. I want to settle that plus scope.

_[tool: ask_user]_

_[tool: list_files]_

_[tool: grep]_

Form came back empty, so I'll decide: architecture reasoning first, then mobile screens for the approver — the one role that genuinely needs a phone.

_[tool: dc_write]_

Answers landed — responsive web, secretariat/compliance/finance/employee users, fully modelled Ch.10. Rewriting on that basis (dropping the board-approver-on-a-phone premise).

_[tool: dc_write]_

_[tool: ready_for_verification]_

Rebuilt on your answers: **1a** is the interactive governance console (rail switches Alerts / Intake / Register / Audit; open a case and decide it; the Intake slider re-evaluates all four ratio tests, the gate, the mandate headroom and the route live), **1b** is the same console at 400px.

Above the screens are the six ADRs with their costs. Three things I'd flag:

- I split the employee COI declarer out of the console entirely — a once-a-year visitor and a daily compliance user can't share a shell without making both worse.
- Greenfield with no ERP feed means intake is manual, so screening has to fire at the keystroke (ADR-05) rather than overnight. That's a real cost: a warm graph projection you invalidate on every registry change.
- "Fully modelled Ch.10" only holds up if thresholds are effective-dated data and every decision pins its rule-set version (ADR-03/02). Hard-coding the 0.25% and 5% gates is the one thing that will make this unauditable in three years.

Nothing in the brief covered the employee declaration flow or announcement drafting — say the word and I'll add either.

## User

Great. now consider the following:
1. built the database to store the info
2. Add one button so that the information can be downloadable in excel format
3. Add one button to upload the Balance sheet and Profit and loss account for the target company

## Assistant

Three additions: the schema, an Excel export, and a financials upload that actually feeds the ratio denominators.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the ADR on denominators, the export button, and the upload panel.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the logic: denominators from state, upload handling, and the Excel export.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

All three are in **1a**:

**Schema** — a new section above the ADRs: PostgreSQL, one database, a schema per module (`registry`, `intake`, `materiality`, `workflow`/`declarations`/`audit`) with the actual columns. Two constraints carry the compliance weight: `party_relation` is never updated in place (a change closes the row and inserts a successor, so the register is queryable as at any past date), and `event` is append-only and hash-chained with no `DELETE` path from the application.

**Export to Excel** — top bar, works for real. Downloads a formatted `.xls` of the case register including the decision, the rule-set version, and the financial basis each ratio was computed against. Without those last two columns the export is a number without provenance.

**Upload balance sheet & P&L** — in Intake, above the consideration slider. Pick any file and the denominators switch to the target company's figures, all four ratio tests, the gate and the route re-evaluate immediately, and the panel goes into an unconfirmed state until you press Confirm.

One argument I'd make on that third one (ADR-07): an upload must create a new `financial_period` row, not edit numbers in place. If denominators are mutable settings, uploading this year's accounts silently rewrites the materiality of every case ever approved. Market cap also isn't in either statement — it needs a price feed or a manual entry, so I've left it on the confirmed group basis and labelled it.

## User

Found issues — fixing…

## Assistant

_[tool: grep]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the assumption grid, the two console panels, and the icons.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the icons — Lucide SVG at stroke-width 1.5 in place of the glyphs.

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now the four glyphs in 1b's bottom bar.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Both adherence misses fixed: Unicode glyphs replaced with inline Lucide paths at stroke-width 1.5 (bell, plus, list, history) in the rail and the mobile bar, and registration marks added to all 19 card-level framed objects — assumption band, bounded-context cards, schema cards, ADR cards, plus the "Why this is here", financial-basis and gate panels. Bare hairlines now only ever mark internal sub-dividers.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Fixed: mandate panel now carries the frame and its four marks, and the ADRs read 01–07 in order — I renumbered rather than moved the cards, so the financials decision is ADR-06 and conflict detection is ADR-07.

## User

Found issues — fixing…

## Assistant

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

Root cause: each tab pane is a flex child with default `min-height:auto`, so it sizes to its content and grows past the fixed 760px row — the inner `overflow:hidden` never engages because those columns expanded too. Adding `min-height:0` down the chain, with real scrollers at the leaves.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: show_html]_

New instructions take priority — rewriting with the seed data removed, a working Intake form, and a submit that actually creates records.

_[tool: dc_write]_

_[tool: ready_for_verification]_

All three done, and the console now starts genuinely empty.

**1. Dummy data deleted.** No seeded cases, parties, events or financial figures. Each tab has its own empty state explaining how records get there. The Excel export and evidence pack are disabled while there is nothing to export.

**2. Submit button.** It now reacts: disabled while required fields are missing, with the label counting them ("Complete 2 required fields") and a hint naming which. Once valid it reads "Submit for secretariat review" and tells you the gate it will submit under. It sits in a fixed action bar pinned below the scrolling form, so it never scrolls away or spills out of the frame — and it wraps rather than clipping at narrow widths (see 1b, where it becomes full-width with a 48px target).

**3. How Intake writes to the database.** Fill the form and submit — one transaction creates everything:

- `intake.rpt_case` — the transaction record, pinned to rule set v2026.1 and route RPT-STD v1
- `registry.party` + `party_relation` — only if the counterparty isn't already in the register, and inserted **unconfirmed** for the secretariat to accept
- `materiality.financial_period` — from your uploaded/keyed figures
- `materiality.materiality_evaluation` — the four ratios and the gate, stored immutably rather than recomputed on read
- `audit.event` — 2–3 hash-chained rows

The right-hand panel lists those writes live as you type, switching between INSERT / UPDATE / SKIP depending on what you've entered. After submit you land in Alerts on the new case, and it appears in Register and Audit too.

One deliberate behaviour: if there's no financial basis, submission still succeeds but materiality is **deferred**, not guessed — the case is flagged as unable to clear secretariat review until a financial period is supplied. Blocking the submitter would push them into a spreadsheet; inventing a denominator would be worse.

## User

Below the "audit" button, add "Guidance" button to illustrate how to determine the RPT/RRPT based on snippent below. Make it interactive including a dummay data to demonstrate the idea

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now the flow logic and the pane.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now the Guidance pane markup.

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

**Guidance** is now the fifth rail item, below Audit.

The three questions from your snippet run as an interactive flow: *related party?* → *happens repeatedly?* → *ordinary course of business?* Later questions stay dimmed until the path reaches them, answered branches fill solid steel, and the three terminals (Not RPT / RPT / RRPT) light up as you land on them. Answering No at question 1 collapses the rest, as in the diagram.

Four worked examples on the right run the flow for you — a monthly haulage contract with the MD's spouse's company (RRPT), a one-off land purchase from a director (RPT), a restructuring advisory fee where a director is a partner (RPT, because it's recurring but not ordinary course), and stationery from an unrelated supplier (Not RPT). These are the only dummy data in the console, and they're labelled as teaching cases.

Each verdict carries what actually attaches — ratio tests and the 0.25% / 5% gates for an RPT, an AGM mandate under 10.09 for an RRPT — and a button that opens Intake with the classification pre-set. One caveat I made explicit in the panel: the flow settles classification only, never materiality; an RPT still has to pass the ratio tests and an RRPT still consumes mandate headroom.

## User

Found issues — fixing…

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Fixed — the two RPT paths are now distinct outcomes rather than one label.

Repeats = No gives "RPT — one-off related party transaction" as before. Repeats = Yes but ordinary course = No now gives "RPT — recurring, but outside the RRPT regime", explaining that it can't sit under an AGM mandate so each occurrence is approved individually, and that occurrences with the same counterparty aggregate fast — the second or third instalment is usually what crosses 5%.

The CTA and the Intake prefill follow that path: a third classification, "Recurring, outside the RRPT mandate regime", now exists in the Intake select and is what gets pinned into `rpt_case`, so nothing files under the wrong classification.

## User

make this in .html format

## Assistant

_[tool: dc_html_str_replace]_

_[tool: super_inline_html]_

_[tool: present_fs_item_for_download]_

`RPT Governance Platform.html` — one self-contained file, 686 KB, works offline with the fonts, stylesheet and all interaction bundled in. Open it in any browser or attach it to an email.

Keep editing the `.dc.html`; ask me to re-export whenever you want a fresh copy.

