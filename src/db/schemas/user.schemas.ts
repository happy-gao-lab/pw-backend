import {
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', {
  id: serial('id').notNull().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  deletionDate: timestamp('deletion_date', { mode: 'string' }),
  tokenVersion: integer('token_version').notNull().default(0),
});

export type UsersTable = typeof usersTable.$inferSelect;
export type CreateUser = typeof usersTable.$inferInsert;
export type UpdateUser = Partial<CreateUser>;
