import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import DB from '../db/index.js';
import {
  definitionsTable,
  dictionaryTable,
  translationsTable,
  wordsTable,
} from '../db/schemas/dictionary.schemas.js';
import { CreateWordDto, FindDictionaryQueryDto, UpdateWordDto } from './dto.js';

const DEFAULT_ITEMS_PER_PAGE = 20;

type Pair = { definitionId: number; translationId: number };

@Injectable()
export class DictionaryService {
  private async findOrCreateWord(value: string): Promise<number> {
    const [existing] = await DB.select()
      .from(wordsTable)
      .where(eq(wordsTable.value, value));
    if (existing) {
      return existing.id;
    }

    const [created] = await DB.insert(wordsTable).values({ value }).returning();
    return created.id;
  }

  private async upsertDefinitions(
    wordId: number,
    values: string[],
  ): Promise<number[]> {
    if (values.length === 0) {
      return [];
    }

    await DB.insert(definitionsTable)
      .values(values.map((value) => ({ wordId, value })))
      .onConflictDoNothing();

    const rows = await DB.select({ id: definitionsTable.id })
      .from(definitionsTable)
      .where(
        and(
          eq(definitionsTable.wordId, wordId),
          inArray(definitionsTable.value, values),
        ),
      );

    return rows.map((row) => row.id);
  }

  private async upsertTranslations(
    wordId: number,
    values: string[],
  ): Promise<number[]> {
    if (values.length === 0) {
      return [];
    }

    await DB.insert(translationsTable)
      .values(values.map((value) => ({ wordId, value })))
      .onConflictDoNothing();

    const rows = await DB.select({ id: translationsTable.id })
      .from(translationsTable)
      .where(
        and(
          eq(translationsTable.wordId, wordId),
          inArray(translationsTable.value, values),
        ),
      );

    return rows.map((row) => row.id);
  }

  private crossProduct(definitionIds: number[], translationIds: number[]): Pair[] {
    return definitionIds.flatMap((definitionId) =>
      translationIds.map((translationId) => ({ definitionId, translationId })),
    );
  }

  async findWordSuggestions(value: string) {
    const [word] = await DB.select().from(wordsTable).where(eq(wordsTable.value, value));

    if (!word) {
      return null;
    }

    const [result] = await DB.select({
      wordId: wordsTable.id,
      word: wordsTable.value,
      definitions: sql<string[]>`json_agg(distinct ${definitionsTable.value})`.as(
        'definitions',
      ),
      translations: sql<string[]>`json_agg(distinct ${translationsTable.value})`.as(
        'translations',
      ),
    })
      .from(wordsTable)
      .where(eq(wordsTable.id, word.id))
      .leftJoin(definitionsTable, eq(wordsTable.id, definitionsTable.wordId))
      .leftJoin(translationsTable, eq(wordsTable.id, translationsTable.wordId))
      .groupBy(wordsTable.id, wordsTable.value);

    return result;
  }

  async create(userId: number, dto: CreateWordDto) {
    if (dto.definitions.length === 0 || dto.translations.length === 0) {
      throw new BadRequestException(
        'At least one definition and one translation are required',
      );
    }

    const wordId = await this.findOrCreateWord(dto.value);
    const definitionIds = await this.upsertDefinitions(wordId, dto.definitions);
    const translationIds = await this.upsertTranslations(wordId, dto.translations);
    const pairs = this.crossProduct(definitionIds, translationIds);

    await DB.insert(dictionaryTable)
      .values(pairs.map((pair) => ({ userId, wordId, ...pair })))
      .onConflictDoNothing();

    return { wordId };
  }

  async findAll(userId: number, query: FindDictionaryQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_ITEMS_PER_PAGE;

    const baseWhere = [eq(dictionaryTable.userId, userId)];
    if (query.search) {
      baseWhere.push(ilike(wordsTable.value, `%${query.search.trim()}%`));
    }
    if (query.ids && query.ids.length > 0) {
      baseWhere.push(inArray(dictionaryTable.wordId, query.ids));
    }

    const data = await DB.select({
      wordId: dictionaryTable.wordId,
      word: wordsTable.value,
      definitions: sql<string[]>`json_agg(distinct ${definitionsTable.value})`.as(
        'definitions',
      ),
      translations: sql<string[]>`json_agg(distinct ${translationsTable.value})`.as(
        'translations',
      ),
    })
      .from(dictionaryTable)
      .where(and(...baseWhere))
      .leftJoin(wordsTable, eq(dictionaryTable.wordId, wordsTable.id))
      .leftJoin(
        definitionsTable,
        and(
          eq(dictionaryTable.wordId, definitionsTable.wordId),
          eq(dictionaryTable.definitionId, definitionsTable.id),
        ),
      )
      .leftJoin(
        translationsTable,
        and(
          eq(dictionaryTable.wordId, translationsTable.wordId),
          eq(dictionaryTable.translationId, translationsTable.id),
        ),
      )
      .groupBy(dictionaryTable.wordId, wordsTable.value)
      .orderBy(asc(wordsTable.value))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [countRow] = await DB.select({
      total: count(sql`distinct ${dictionaryTable.wordId}`),
    })
      .from(dictionaryTable)
      .where(eq(dictionaryTable.userId, userId));

    const total = countRow?.total ?? 0;
    const pages = Math.ceil(total / pageSize);

    return { data, total, pages, page };
  }

  async update(userId: number, wordId: number, dto: UpdateWordDto) {
    if (dto.definitions.length === 0 || dto.translations.length === 0) {
      throw new BadRequestException(
        'At least one definition and one translation are required',
      );
    }

    const existingRows = await DB.select({
      id: dictionaryTable.id,
      definitionId: dictionaryTable.definitionId,
      translationId: dictionaryTable.translationId,
    })
      .from(dictionaryTable)
      .where(
        and(eq(dictionaryTable.userId, userId), eq(dictionaryTable.wordId, wordId)),
      );

    if (existingRows.length === 0) {
      throw new NotFoundException('Word not found in dictionary');
    }

    const definitionIds = await this.upsertDefinitions(wordId, dto.definitions);
    const translationIds = await this.upsertTranslations(wordId, dto.translations);
    const newPairs = this.crossProduct(definitionIds, translationIds);

    const pairKey = (pair: Pair) => `${pair.definitionId}:${pair.translationId}`;
    const newKeys = new Set(newPairs.map(pairKey));
    const existingKeys = new Set(existingRows.map(pairKey));

    const idsToDelete = existingRows
      .filter((row) => !newKeys.has(pairKey(row)))
      .map((row) => row.id);
    const pairsToInsert = newPairs.filter((pair) => !existingKeys.has(pairKey(pair)));

    if (idsToDelete.length > 0) {
      await DB.delete(dictionaryTable).where(inArray(dictionaryTable.id, idsToDelete));
    }

    if (pairsToInsert.length > 0) {
      await DB.insert(dictionaryTable).values(
        pairsToInsert.map((pair) => ({ userId, wordId, ...pair })),
      );
    }
  }

  async remove(userId: number, wordId: number) {
    const deleted = await DB.delete(dictionaryTable)
      .where(
        and(eq(dictionaryTable.userId, userId), eq(dictionaryTable.wordId, wordId)),
      )
      .returning({ id: dictionaryTable.id });

    if (deleted.length === 0) {
      throw new NotFoundException('Word not found in dictionary');
    }
  }
}
