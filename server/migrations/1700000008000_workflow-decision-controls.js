export const shorthands = undefined;

/**
 * Three changes needed to make Alerts' decision step a real control rather
 * than a label:
 *
 * 1. `decision_key` stores the raw approve/reject/refer outcome alongside
 *    the human-readable `decision` label, so code can branch on outcome
 *    without parsing display text (the aggregation-window query in
 *    materiality/repository.ts needs this to stop counting rejected
 *    transactions as if they had gone ahead).
 * 2. `conflict_confirmed` records that the deciding user actively attested
 *    they are not a related party to (and have no interest in) the case
 *    they are deciding — the "interested parties are excluded" claim in the
 *    Alerts UI previously had nothing behind it.
 * 3. `intake.rpt_case.pending_approver_*` implements maker-checker for the
 *    circular gate: a case at that gate needs an approval from a second,
 *    different Compliance/Admin account before it is treated as approved —
 *    the first approval is held here rather than immediately finalising the
 *    case. Lower gates keep single-approval as before.
 */
export function up(pgm) {
  pgm.addColumn({ schema: 'workflow', name: 'approval_step' }, {
    decision_key: { type: 'text', check: "decision_key in ('approve','reject','refer')" },
    conflict_confirmed: { type: 'boolean', notNull: true, default: false },
  });
  pgm.sql(`
    update workflow.approval_step set decision_key =
      case
        when decision like 'Rejected%' then 'reject'
        when decision like 'Returned for further information%' then 'refer'
        else 'approve'
      end
    where decision_key is null;
  `);

  pgm.addColumn({ schema: 'intake', name: 'rpt_case' }, {
    pending_approver_id: { type: 'text' },
    pending_approver_label: { type: 'text' },
    pending_approved_at: { type: 'timestamptz' },
  });
}

export function down(pgm) {
  pgm.dropColumn({ schema: 'intake', name: 'rpt_case' }, ['pending_approver_id', 'pending_approver_label', 'pending_approved_at']);
  pgm.dropColumn({ schema: 'workflow', name: 'approval_step' }, ['decision_key', 'conflict_confirmed']);
}
