import {
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from './user.schemas.js';

export const sessionsTable = pgTable(
  'sessions',
  {
    id: serial('id').notNull().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    // id of the refresh token that is currently valid for this session
    tokenId: uuid('token_id').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export type SessionsTable = typeof sessionsTable.$inferSelect;
export type CreateSession = typeof sessionsTable.$inferInsert;
export type UpdateSession = Partial<CreateSession>;
