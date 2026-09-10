import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import { errors } from '../../constants/errors.js';
import DB from '../../db/index.js';
import {
  UserWordDefinitionsTable,
  userWordsTable,
  UserWordTranslationsTable,
} from '../../db/schemas/user-dictionary.schemas.js';

@Injectable()
export class UserDictionaryService {
  constructor(private readonly logger: Logger) {}

  private async createUserWord(userId: number, wordId: number) {
    const [createdUserWord] = await DB.insert(userWordsTable)
      .values({
        userId,
        wordId,
      })
      .returning();

    if (!createdUserWord) {
      this.logger.error(
        { userId, wordId },
        'Failed to add word to the user dictionary',
      );
      throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
    }

    return createdUserWord;
  }

  private async createUserWordValues(
    table: UserWordTranslationsTable | UserWordDefinitionsTable,
    label: string,
    userWordId: number,
    ids: number[],
  ) {
    if (ids.length === 0) {
      return { created: [], skipped: [] };
    }

    const created = await DB.insert(table)
      .values(ids.map((id) => ({ userWordId, valueId: id })))
      .onConflictDoNothing()
      .returning();

    const createdIds = new Set(created.map((row) => row.valueId));
    const skipped = ids.filter((id) => !createdIds.has(id));

    if (skipped.length > 0) {
      this.logger.warn(
        { userWordId, skipped },
        `Some ${label.toLowerCase()}s were skipped as duplicates`,
      );
    }

    return { created, skipped };
  }
}
