import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { Logger } from 'nestjs-pino';

import { errors } from '../../constants/errors.js';
import DB from '../../db/index.js';
import {
  definitionsTable,
  DefinitionsTable,
  translationsTable,
  TranslationsTable,
  wordsTable,
} from '../../db/schemas/global-dictionary.schemas.js';
import { Tx } from '../../types/index.js';
import { CreateWordDto, UpdateWordEntryDto } from './dto.js';

@Injectable()
export class GlobalDictionaryService {
  constructor(private readonly logger: Logger) {}

  private async createWord(tx: Tx, value: string) {
    const [createdWord] = await tx
      .insert(wordsTable)
      .values({ value })
      .returning();

    if (!createdWord) {
      this.logger.error({ word: value }, 'Failed to create word');
      throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
    }

    return createdWord;
  }

  private async createWordValues(
    tx: Tx,
    table: TranslationsTable | DefinitionsTable,
    label: string,
    wordId: number,
    values: string[],
  ) {
    if (values.length === 0) {
      return;
    }

    const tooLong = values.find((value) => value.length > 255);

    if (tooLong) {
      this.logger.error({ wordId, value: tooLong }, 'Value is too long');
      throw new BadRequestException({
        message: errors.LONG_VALUE,
        key: label,
        value: tooLong,
      });
    }

    await tx
      .insert(table)
      .values(values.map((value) => ({ wordId, value })))
      .onConflictDoNothing();
  }

  private async addWord(tx: Tx, value: string) {
    const [existingWord] = await tx
      .select()
      .from(wordsTable)
      .where(sql`lower(${wordsTable.value}) = lower(${value})`);

    if (existingWord) {
      return existingWord.id;
    }

    const newWord = await this.createWord(tx, value);

    return newWord.id;
  }

  private async addWordValues(
    tx: Tx,
    table: TranslationsTable | DefinitionsTable,
    label: string,
    wordId: number,
    values: string[],
  ) {
    await this.createWordValues(tx, table, label, wordId, values);

    const rows = await tx
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.wordId, wordId),
          inArray(
            sql`lower(${table.value})`,
            values.map((v) => v.toLowerCase()),
          ),
        ),
      );

    return rows.map((row) => row.id);
  }

  async createWordEntry(dto: CreateWordDto) {
    return await DB.transaction(async (tx) => {
      const wordId = await this.addWord(tx, dto.value);

      const translationsIds = await this.addWordValues(
        tx,
        translationsTable,
        'translations',
        wordId,
        dto.translations,
      );

      const definitionsIds = await this.addWordValues(
        tx,
        definitionsTable,
        'definitions',
        wordId,
        dto.definitions,
      );

      return {
        wordId,
        translations: translationsIds,
        definitions: definitionsIds,
      };
    });
  }

  async updateWordEntry(wordId: number, dto: UpdateWordEntryDto) {
    return await DB.transaction(async (tx) => {
      const translationsIds = await this.addWordValues(
        tx,
        translationsTable,
        'translations',
        wordId,
        dto.translations,
      );

      const definitionsIds = await this.addWordValues(
        tx,
        definitionsTable,
        'definitions',
        wordId,
        dto.definitions,
      );

      return {
        wordId,
        translations: translationsIds,
        definitions: definitionsIds,
      };
    });
  }
}
