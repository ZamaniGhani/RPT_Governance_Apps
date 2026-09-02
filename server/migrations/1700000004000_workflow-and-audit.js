export const shorthands = undefined;

export function up(pgm) {
  pgm.createTable(
    { schema: 'workflow', name: 'approval_step' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      case_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'intake', name: 'rpt_case' },
      },
      seq: { type: 'integer', notNull: true },
      role: { type: 'text', notNull: true },
      actor_id: { type: 'text', notNull: true },
      decision: { type: 'text', notNull: true },
      rationale: { type: 'text' },
      decided_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      excluded_reason: { type: 'text' },
    }
  );
  pgm.addConstraint({ schema: 'workflow', name: 'approval_step' }, 'approval_step_case_seq_uk', {
    unique: ['case_id', 'seq'],
  });

  pgm.createTable(
    { schema: 'audit', name: 'event' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      aggregate_type: { type: 'text', notNull: true },
      aggregate_id: { type: 'text', notNull: true },
      seq: { type: 'integer', notNull: true },
      type: { type: 'text', notNull: true },
      payload: { type: 'jsonb', notNull: true },
      detail: { type: 'text', notNull: true },
      actor_id: { type: 'text', notNull: true },
      occurred_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      prev_hash: { type: 'text' },
      hash: { type: 'text', notNull: true },
    }
  );
  pgm.addConstraint({ schema: 'audit', name: 'event' }, 'event_aggregate_seq_uk', {
    unique: ['aggregate_id', 'seq'],
  });
  pgm.createIndex({ schema: 'audit', name: 'event' }, 'occurred_at');

  // The event log is append-only and hash-chained. No role — including the
  // application's own DB user — has a DELETE or UPDATE path against it.
  pgm.sql(`
    create function audit.forbid_event_mutation() returns trigger as $$
    begin
      raise exception 'audit.event is append-only: it cannot be updated or deleted';
    end;
    $$ language plpgsql;
  `);
  pgm.sql(`
    create trigger event_no_mutate
      before update or delete on audit.event
      for each row execute function audit.forbid_event_mutation();
  `);
}

export function down(pgm) {
  pgm.dropSchema('workflow', { cascade: true, ifExists: true });
  pgm.dropSchema('audit', { cascade: true, ifExists: true });
}
