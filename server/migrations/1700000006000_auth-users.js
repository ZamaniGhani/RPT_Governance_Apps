export const shorthands = undefined;

/**
 * Adds an email address to each account (for the user directory / monitoring
 * list) and a uniqueness constraint on both username and email so two
 * accounts can never collide. The existing seeded admin account is backfilled
 * with a placeholder address since the column is not-null.
 */
export function up(pgm) {
  pgm.addColumn({ schema: 'auth', name: 'account' }, {
    email: { type: 'text' },
  });
  pgm.sql(`update auth.account set email = 'admin@example.com' where username = 'admin'`);
  pgm.alterColumn({ schema: 'auth', name: 'account' }, 'email', { notNull: true });
  pgm.addConstraint({ schema: 'auth', name: 'account' }, 'account_email_unique', 'unique (email)');
}

export function down(pgm) {
  pgm.dropConstraint({ schema: 'auth', name: 'account' }, 'account_email_unique');
  pgm.dropColumn({ schema: 'auth', name: 'account' }, 'email');
}
