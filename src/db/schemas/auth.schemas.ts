import {
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import { usersTable } from './user.schemas.js';

export const authProvider = pgEnum('provider', ['local', 'google']);

export const authIdentitiesTable = pgTable(
  'auth_identities',
  {
    id: serial('id').notNull().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersTable.id, {
        onDelete: 'cascade',
      }),
    provider: authProvider().notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }), // provider sub, null for local
    passwordHash: varchar('password_hash', { length: 255 }), // only for local, for provider - null
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.provider, table.providerUserId),
    unique().on(table.userId, table.provider),
  ],
);

export type AuthIdentitiesTable = typeof authIdentitiesTable;
export type AuthIdentity = typeof authIdentitiesTable.$inferSelect;
export type CreateAuthIdentity = typeof authIdentitiesTable.$inferInsert;
export type UpdateAuthIdentity = Partial<CreateAuthIdentity>;
