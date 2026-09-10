import { defineRelations } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';
import {
  integer,
  pgTable,
  serial,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

import {
  definitionsTable,
  translationsTable,
  wordsTable,
} from './global-dictionary.schemas.js';
import { usersTable } from './user.schemas.js';

export const userWordsTable = pgTable(
  'user_words',
  {
    id: serial('id').notNull().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => wordsTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique('user_words_unique').on(table.userId, table.wordId)],
);

export type UserWordsTable = typeof userWordsTable;
export type UserWord = typeof userWordsTable.$inferSelect;
export type CreateUserWord = typeof userWordsTable.$inferInsert;
export type UpdateUserWord = Partial<CreateUserWord>;

export const userWordTranslationsTable = pgTable(
  'user_word_translations',
  {
    id: serial('id').notNull().primaryKey(),
    userWordId: integer('user_word_id')
      .notNull()
      .references(() => userWordsTable.id, { onDelete: 'cascade' }),
    valueId: integer('value_id')
      .notNull()
      .references(() => translationsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    unique('user_word_translations_unique').on(table.userWordId, table.valueId),
  ],
);

export type UserWordTranslationsTable = typeof userWordTranslationsTable;
export type UserWordTranslation = typeof userWordTranslationsTable.$inferSelect;
export type CreateUserWordTranslations =
  typeof userWordTranslationsTable.$inferInsert;
export type UpdateUserWordTranslations = Partial<CreateUserWordTranslations>;

export const userWordDefinitionsTable = pgTable(
  'user_word_definitions',
  {
    id: serial('id').notNull().primaryKey(),
    userWordId: integer('user_word_id')
      .notNull()
      .references(() => userWordsTable.id, { onDelete: 'cascade' }),
    valueId: integer('value_id')
      .notNull()
      .references(() => definitionsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    unique('user_word_definitions_unique').on(table.userWordId, table.valueId),
  ],
);

export type UserWordDefinitionsTable = typeof userWordDefinitionsTable;
export type UserWordDefinition = typeof userWordDefinitionsTable.$inferSelect;
export type CreateUserWordDefinitions =
  typeof userWordDefinitionsTable.$inferInsert;
export type UpdateUserWordDefinitions = Partial<CreateUserWordDefinitions>;
