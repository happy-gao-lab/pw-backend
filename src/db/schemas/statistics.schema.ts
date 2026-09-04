import { integer, pgTable, serial, timestamp, unique } from 'drizzle-orm/pg-core';
import { usersTable } from './users.schema.js';
import { wordsTable } from './dictionary.schemas.js';

export const wordProgressTable = pgTable(
  'word_progress',
  {
    id: serial('id').notNull().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => wordsTable.id, { onDelete: 'cascade' }),
    correctCount: integer('correct_count').notNull().default(0),
    incorrectCount: integer('incorrect_count').notNull().default(0),
    lastPracticedAt: timestamp('last_practiced_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (t) => [unique('word_progress_unique').on(t.userId, t.wordId)],
);

export const userStatsTable = pgTable('user_stats', {
  userId: integer('user_id')
    .notNull()
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  repetitionsTarget: integer('repetitions_target').notNull().default(100),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  totalScore: integer('total_score').notNull().default(0),
  lastPracticedAt: timestamp('last_practiced_at', { mode: 'string' }),
});
