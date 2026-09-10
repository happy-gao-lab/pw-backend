import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import { errors } from '../../constants/errors.js';
import DB from '../../db/index.js';
import {
  DefinitionsTable,
  TranslationsTable,
  wordsTable,
} from '../../db/schemas/global-dictionary.schemas.js';

@Injectable()
export class GlobalDictionaryService {
  constructor(private readonly logger: Logger) {}

  private async createWord(value: string) {
    const [createdWord] = await DB.insert(wordsTable)
      .values({
        value,
      })
      .returning();

    if (!createdWord) {
      this.logger.error({ word: value }, 'Failed to create word');
      throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
    }

    return createdWord;
  }

  private async createWordValues(
    table: TranslationsTable | DefinitionsTable,
    label: string,
    wordId: number,
    values: string[],
  ) {
    if (values.length === 0) {
      return { created: [], skipped: [] };
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

    const created = await DB.insert(table)
      .values(values.map((value) => ({ wordId, value })))
      .onConflictDoNothing()
      .returning();

    const createdValues = new Set(
      created.map((row) => row.value.toLowerCase()),
    );
    const skipped = values.filter(
      (value) => !createdValues.has(value.toLowerCase()),
    );

    if (skipped.length > 0) {
      this.logger.warn(
        { wordId, skipped },
        `Some ${label.toLowerCase()}s were skipped as duplicates`,
      );
    }

    return { created, skipped };
  }
}
