export const shorthands = undefined;

export function up(pgm) {
  pgm.createTable(
    { schema: 'materiality', name: 'rule_set' },
    {
      version: { type: 'text', primaryKey: true },
      effective_from: { type: 'timestamptz', notNull: true },
      thresholds: { type: 'jsonb', notNull: true },
      retired_at: { type: 'timestamptz' },
    }
  );

  pgm.createTable(
    { schema: 'materiality', name: 'financial_period' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      entity_scope: { type: 'text', notNull: true, default: 'group' },
      label: { type: 'text', notNull: true },
      basis: { type: 'text', notNull: true, default: 'unaudited', check: "basis in ('audited','unaudited','proforma')" },
      period_end: { type: 'date' },
      net_assets: { type: 'numeric' },
      total_assets: { type: 'numeric' },
      market_cap: { type: 'numeric' },
      net_profit: { type: 'numeric' },
      source_document_id: {
        type: 'uuid',
        references: { schema: 'intake', name: 'rpt_document' },
      },
      confirmed_by: { type: 'text' },
      confirmed_at: { type: 'timestamptz' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  pgm.createTable(
    { schema: 'materiality', name: 'materiality_evaluation' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      case_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'intake', name: 'rpt_case' },
      },
      rule_set_version: {
        type: 'text',
        notNull: true,
        references: { schema: 'materiality', name: 'rule_set' },
      },
      financial_period_id: {
        type: 'uuid',
        references: { schema: 'materiality', name: 'financial_period' },
      },
      ratios: { type: 'jsonb', notNull: true },
      top_pct: { type: 'numeric' },
      aggregate_myr: { type: 'numeric' },
      aggregate_pct: { type: 'numeric' },
      gate: { type: 'text', notNull: true, check: "gate in ('none','record','announce','circular')" },
      // The rendered gate title/body are persisted verbatim alongside the key.
      // Thresholds and wording can change in a later rule set; a decision
      // made under this evaluation must keep reading exactly as it did the
      // day it was computed (ADR-03).
      gate_title: { type: 'text', notNull: true },
      gate_body: { type: 'text', notNull: true },
      computed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  // Evaluations are stored, not recomputed on read — nothing should ever
  // rewrite one after the fact (ADR: a ratio shown to an approver must
  // still render identically years later).
  pgm.sql(`
    create function materiality.forbid_evaluation_mutation() returns trigger as $$
    begin
      raise exception 'materiality.materiality_evaluation rows are immutable once computed';
    end;
    $$ language plpgsql;
  `);
  pgm.sql(`
    create trigger materiality_evaluation_no_mutate
      before update or delete on materiality.materiality_evaluation
      for each row execute function materiality.forbid_evaluation_mutation();
  `);

  pgm.sql(`
    insert into materiality.rule_set (version, effective_from, thresholds)
    values (
      'MMLR-CH10 v2026.1',
      '2026-01-01T00:00:00Z',
      '{"announceThreshold": 0.25, "circularThreshold": 5, "profitAttributableFactor": 0.14}'::jsonb
    );
  `);
}

export function down(pgm) {
  pgm.dropSchema('materiality', { cascade: true, ifExists: true });
}
