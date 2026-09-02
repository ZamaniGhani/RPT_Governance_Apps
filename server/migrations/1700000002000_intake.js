export const shorthands = undefined;

export function up(pgm) {
  pgm.createTable(
    { schema: 'intake', name: 'rpt_document' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      kind: { type: 'text', notNull: true, default: 'financial_statement' },
      filename: { type: 'text', notNull: true },
      byte_size: { type: 'integer', notNull: true },
      sha256: { type: 'text', notNull: true },
      uploaded_by: { type: 'text', notNull: true },
      at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  pgm.createTable(
    { schema: 'intake', name: 'rpt_case' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      ref: { type: 'text', notNull: true, unique: true },
      kind: {
        type: 'text',
        notNull: true,
        check: "kind in ('rpt_one_off','rrpt','rpt_recurring_non_ordinary')",
      },
      counterparty_party_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'registry', name: 'party' },
      },
      counterparty_relation_id: {
        type: 'uuid',
        references: { schema: 'registry', name: 'party_relation' },
      },
      nature: { type: 'text', notNull: true },
      consideration_myr: { type: 'numeric', notNull: true },
      currency: { type: 'text', notNull: true, default: 'MYR' },
      fx_rate: { type: 'numeric', notNull: true, default: 1 },
      transaction_date: { type: 'date' },
      submitted_by: { type: 'text', notNull: true },
      rule_set_version: { type: 'text', notNull: true },
      route_version: { type: 'text', notNull: true },
      status: { type: 'text', notNull: true, default: 'open', check: "status in ('open','decided')" },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  pgm.createIndex({ schema: 'intake', name: 'rpt_case' }, 'counterparty_party_id');
  pgm.createIndex({ schema: 'intake', name: 'rpt_case' }, 'created_at');
}

export function down(pgm) {
  pgm.dropSchema('intake', { cascade: true, ifExists: true });
}
