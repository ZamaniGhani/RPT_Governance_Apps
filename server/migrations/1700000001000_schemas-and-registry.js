export const shorthands = undefined;

export function up(pgm) {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  for (const schema of ['registry', 'intake', 'materiality', 'workflow', 'audit']) {
    pgm.createSchema(schema, { ifNotExists: true });
  }

  pgm.createTable(
    { schema: 'registry', name: 'party' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      kind: { type: 'text', notNull: true, check: "kind in ('person','entity')" },
      legal_name: { type: 'text', notNull: true },
      nric_or_reg_no: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  pgm.createTable(
    { schema: 'registry', name: 'party_relation' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      from_party: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'registry', name: 'party' },
      },
      to_party: {
        type: 'uuid',
        references: { schema: 'registry', name: 'party' },
      },
      basis: {
        type: 'text',
        notNull: true,
        check: "basis in ('spouse','child','director','shareholder','control','associate')",
      },
      basis_label: { type: 'text', notNull: true },
      source: { type: 'text', notNull: true, check: "source in ('declared','detected','manual')" },
      confidence: { type: 'numeric' },
      effective_from: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      effective_to: { type: 'timestamptz' },
      confirmed_by: { type: 'text' },
      confirmed_at: { type: 'timestamptz' },
    }
  );

  // party_relation is effective-dated: a change closes the row (effective_to)
  // and a successor is inserted. Nothing may mutate the identity of an
  // existing edge, and nothing may delete one outright.
  pgm.sql(`
    create function registry.forbid_party_relation_mutation() returns trigger as $$
    begin
      if TG_OP = 'DELETE' then
        raise exception 'registry.party_relation is effective-dated and append-only: close a row with effective_to instead of deleting it';
      end if;
      if NEW.id <> OLD.id
         or NEW.from_party <> OLD.from_party
         or NEW.to_party is distinct from OLD.to_party
         or NEW.basis <> OLD.basis
         or NEW.basis_label <> OLD.basis_label
         or NEW.source <> OLD.source
         or NEW.effective_from <> OLD.effective_from then
        raise exception 'registry.party_relation rows are immutable except for effective_to, confirmed_by and confirmed_at';
      end if;
      return NEW;
    end;
    $$ language plpgsql;
  `);
  pgm.sql(`
    create trigger party_relation_no_mutate
      before update or delete on registry.party_relation
      for each row execute function registry.forbid_party_relation_mutation();
  `);

  pgm.sql('create index party_legal_name_lower_idx on registry.party (lower(legal_name));');
}

export function down(pgm) {
  pgm.dropSchema('registry', { cascade: true, ifExists: true });
}
