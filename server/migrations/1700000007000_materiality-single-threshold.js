export const shorthands = undefined;

/**
 * Corrects the RPT gate structure. The seeded v2026.1 rule set used a
 * two-tier gate — 0.25% "announce only, no shareholder approval" and a
 * separate 5% "circular" gate — that does not match Bursa Malaysia Main LR
 * Chapter 10 Part III: real practice puts immediate announcement AND the
 * circular/shareholder-approval requirement at the SAME 5% percentage-ratio
 * threshold for a one-off (or non-ordinary-course-recurring) related party
 * transaction. There is no 0.25% band for that class of transaction.
 *
 * Rather than mutate the old rule set in place, this retires it and inserts
 * a new version effective now (ADR-03: thresholds are effective-dated data).
 * Any case already evaluated under v2026.1 keeps reading exactly as it did —
 * materiality.materiality_evaluation stores the gate title/body verbatim at
 * computation time and is immutable, so this migration cannot and does not
 * change history. It only changes how transactions submitted from now on
 * are gated.
 */
export function up(pgm) {
  pgm.sql(`update materiality.rule_set set retired_at = now() where version = 'MMLR-CH10 v2026.1' and retired_at is null`);
  pgm.sql(`
    insert into materiality.rule_set (version, effective_from, thresholds)
    values (
      'MMLR-CH10 v2026.2',
      now(),
      '{"materialThreshold": 5, "profitAttributableFactor": 0.14}'::jsonb
    );
  `);
}

export function down(pgm) {
  pgm.sql(`delete from materiality.rule_set where version = 'MMLR-CH10 v2026.2'`);
  pgm.sql(`update materiality.rule_set set retired_at = null where version = 'MMLR-CH10 v2026.1'`);
}
