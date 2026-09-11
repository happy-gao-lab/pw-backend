import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { Logger } from 'nestjs-pino';

import { errors } from '../../constants/errors.js';
import DB from '../../db/index.js';
import {
  userWordDefinitionsTable,
  UserWordDefinitionsTable,
  userWordsTable,
  userWordTranslationsTable,
  UserWordTranslationsTable,
} from '../../db/schemas/user-dictionary.schemas.js';
import { Tx } from '../../types/index.js';
import { CreateWordDto } from '../global-dictionary/dto.js';
import { GlobalDictionaryService } from '../global-dictionary/global-dictionary.service.js';
import { UpdateUserWordEntryDto } from './dto.js';

@Injectable()
export class UserDictionaryService {
  constructor(
    private readonly logger: Logger,
    private readonly globalDictionaryService: GlobalDictionaryService,
  ) {}

  private async addUserWord(tx: Tx, userId: number, wordId: number) {
    const [existingUserWord] = await tx
      .select()
      .from(userWordsTable)
      .where(
        and(
          eq(userWordsTable.userId, userId),
          eq(userWordsTable.wordId, wordId),
        ),
      );

    if (existingUserWord) {
      return existingUserWord.id;
    }

    const [newUserWord] = await tx
      .insert(userWordsTable)
      .values({ userId, wordId })
      .returning();

    if (!newUserWord) {
      this.logger.error(
        { userId, wordId },
        'Failed to add word to the user dictionary',
      );
      throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
    }

    return newUserWord.id;
  }

  private async addUserWordValues(
    tx: Tx,
    table: UserWordTranslationsTable | UserWordDefinitionsTable,
    userWordId: number,
    ids: number[],
  ) {
    await tx
      .insert(table)
      .values(ids.map((valueId) => ({ userWordId, valueId })))
      .onConflictDoNothing();

    const rows = await tx
      .select({ id: table.id })
      .from(table)
      .where(
        and(eq(table.userWordId, userWordId), inArray(table.valueId, ids)),
      );

    return rows.map((row) => row.id);
  }

  private async removeUserWordValues(
    tx: Tx,
    table: UserWordTranslationsTable | UserWordDefinitionsTable,
    userWordId: number,
    ids: number[],
  ) {
    if (ids.length === 0) {
      return;
    }

    await tx
      .delete(table)
      .where(and(eq(table.userWordId, userWordId), inArray(table.id, ids)));
  }

  async createUserWordEntry(userId: number, dto: CreateWordDto) {
    if (dto.definitions.length === 0 || dto.translations.length === 0) {
      throw new BadRequestException(
        dto.definitions.length === 0
          ? errors.DEFINITION_REQUIRED
          : errors.TRANSLATION_REQUIRED,
      );
    }

    const wordEntry = await this.globalDictionaryService.createWordEntry(dto);

    return await DB.transaction(async (tx) => {
      const userWordId = await this.addUserWord(tx, userId, wordEntry.wordId);
      const userWordTranslations = await this.addUserWordValues(
        tx,
        userWordTranslationsTable,
        userWordId,
        wordEntry.translations,
      );
      const userWordDefinitions = await this.addUserWordValues(
        tx,
        userWordDefinitionsTable,
        userWordId,
        wordEntry.definitions,
      );

      return {
        userWordId,
        translations: userWordTranslations,
        definitions: userWordDefinitions,
      };
    });
  }

  async deleteUserWordEntry(userId: number, id: number) {
    const deleted = await DB.delete(userWordsTable)
      .where(and(eq(userWordsTable.userId, userId), eq(userWordsTable.id, id)))
      .returning({ id: userWordsTable.id });

    if (deleted.length === 0) {
      throw new NotFoundException(errors.WORD_NOT_FOUND);
    }
  }

  async updateUserWordEntry(
    userId: number,
    userWordId: number,
    dto: UpdateUserWordEntryDto,
  ) {
    const [userWord] = await DB.select({ wordId: userWordsTable.wordId })
      .from(userWordsTable)
      .where(
        and(
          eq(userWordsTable.id, userWordId),
          eq(userWordsTable.userId, userId),
        ),
      );

    if (!userWord) {
      throw new NotFoundException(errors.WORD_NOT_FOUND);
    }

    const wordEntry = await this.globalDictionaryService.updateWordEntry(
      userWord.wordId,
      { translations: dto.addTranslations, definitions: dto.addDefinitions },
    );

    return await DB.transaction(async (tx) => {
      const addedTranslations = await this.addUserWordValues(
        tx,
        userWordTranslationsTable,
        userWordId,
        wordEntry.translations,
      );

      const addedDefinitions = await this.addUserWordValues(
        tx,
        userWordDefinitionsTable,
        userWordId,
        wordEntry.definitions,
      );

      await this.removeUserWordValues(
        tx,
        userWordTranslationsTable,
        userWordId,
        dto.removeTranslationIds,
      );

      await this.removeUserWordValues(
        tx,
        userWordDefinitionsTable,
        userWordId,
        dto.removeDefinitionIds,
      );

      return {
        userWordId,
        addedTranslations,
        addedDefinitions,
      };
    });
  }

  async getUserDictionary(userId: number) {
    const rows = await DB.query.userWordsTable.findMany({
      where: { userId },
      columns: { id: true },
      with: {
        word: { columns: { value: true } },
        translations: { columns: { id: true, value: true } },
        definitions: { columns: { id: true, value: true } },
      },
    });

    const dictionary = rows.map((row) => ({
      id: row.id,
      word: row.word.value,
      translations: row.translations,
      definitions: row.definitions,
    }));

    return dictionary;
  }
}
