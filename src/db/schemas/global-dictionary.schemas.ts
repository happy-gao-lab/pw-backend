import { sql } from 'drizzle-orm';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const wordsTable = pgTable(
  'words',
  {
    id: serial('id').notNull().primaryKey(),
    value: varchar('value', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('words_value_lower_unique').on(sql`lower(${table.value})`),
  ],
);

export type WordsTable = typeof wordsTable;
export type Word = typeof wordsTable.$inferSelect;
export type CreateWord = typeof wordsTable.$inferInsert;
export type UpdateWord = Partial<CreateWord>;

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
  (table) => [
    uniqueIndex('definitions_value_lower_unique').on(
      table.wordId,
      sql`lower(${table.value})`,
    ),
  ],
);

export type DefinitionsTable = typeof definitionsTable;
export type Definition = typeof definitionsTable.$inferSelect;
export type CreateDefinition = typeof definitionsTable.$inferInsert;
export type UpdateDefinition = Partial<CreateDefinition>;

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
  (table) => [
    uniqueIndex('translations_value_lower_unique').on(
      table.wordId,
      sql`lower(${table.value})`,
    ),
  ],
);

export type TranslationsTable = typeof translationsTable;
export type Translation = typeof translationsTable.$inferSelect;
export type CreateTranslation = typeof translationsTable.$inferInsert;
export type UpdateTranslation = Partial<CreateTranslation>;
