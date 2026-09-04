export const shorthands = undefined;

/**
 * Login and session control, so use of the console can be attributed to a
 * real person and department rather than a header the browser is trusted
 * to set truthfully. Departments gate which mutating actions an account may
 * take (ADR-style split already implicit in the console's personas: Finance
 * submits, Compliance decides, the Secretariat administers the register);
 * "admin" bypasses department checks for initial setup and support.
 */
export function up(pgm) {
  pgm.createSchema('auth', { ifNotExists: true });

  pgm.createTable(
    { schema: 'auth', name: 'account' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      username: { type: 'text', notNull: true, unique: true },
      password_hash: { type: 'text', notNull: true },
      display_name: { type: 'text', notNull: true },
      department: {
        type: 'text',
        notNull: true,
        check: "department in ('finance','compliance','secretariat','admin')",
      },
      active: { type: 'boolean', notNull: true, default: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      last_login_at: { type: 'timestamptz' },
    }
  );

  pgm.createTable(
    { schema: 'auth', name: 'session' },
    {
      token: { type: 'text', primaryKey: true },
      account_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'auth', name: 'account' },
      },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      expires_at: { type: 'timestamptz', notNull: true },
      user_agent: { type: 'text' },
    }
  );
  pgm.createIndex({ schema: 'auth', name: 'session' }, 'account_id');

  // A revoked/expired session is deleted outright — unlike audit.event, a
  // session token is a credential, not a governance record, so nothing is
  // lost by removing it once it's dead.
  pgm.sql(`
    insert into auth.account (username, password_hash, display_name, department)
    values ('admin', '$2b$10$DVx81o8WmVqZncvoMckkpegahKrUwVpbAPWzCSbOvcYBjFRpFtwjK', 'System Administrator', 'admin');
  `);
}

export function down(pgm) {
  pgm.dropSchema('auth', { cascade: true, ifExists: true });
}
