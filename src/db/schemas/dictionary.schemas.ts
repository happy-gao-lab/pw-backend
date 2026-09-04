import {
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { unique } from 'drizzle-orm/pg-core';
import { text } from 'drizzle-orm/pg-core';
import { usersTable } from './users.schema.js';

export const wordsTable = pgTable('words', {
  id: serial('id').notNull().primaryKey(),
  value: varchar('value', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const definitionsTable = pgTable(
  'definitions',
  {
    id: serial('id').notNull().primaryKey(),
    wordId: integer('word_id')
      .notNull()
      .references(() => wordsTable.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique('definition_unique').on(t.wordId, t.value)],
);

export const translationsTable = pgTable(
  'translations',
  {
    id: serial('id').notNull().primaryKey(),
    wordId: integer('word_id')
      .notNull()
      .references(() => wordsTable.id, { onDelete: 'cascade' }),
    value: varchar('value', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique('translations_unique').on(t.wordId, t.value)],
);

export const dictionaryTable = pgTable(
  'dictionary',
  {
    id: serial('id').notNull().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => wordsTable.id, { onDelete: 'cascade' }),
    definitionId: integer('definition_id')
      .notNull()
      .references(() => definitionsTable.id, { onDelete: 'cascade' }),
    translationId: integer('translation_id')
      .notNull()
      .references(() => translationsTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('dictionary_unique').on(
      t.userId,
      t.wordId,
      t.definitionId,
      t.translationId,
    ),
  ],
);
