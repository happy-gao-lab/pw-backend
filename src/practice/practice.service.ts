import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import DB from '../db/index.js';
import {
  definitionsTable,
  dictionaryTable,
  translationsTable,
  wordsTable,
} from '../db/schemas/dictionary.schemas.js';
import { userStatsTable, wordProgressTable } from '../db/schemas/statistics.schema.js';
import { StatisticsService } from '../statistics/statistics.service.js';
import { PracticeFilter, VerifyAnswerDto } from './dto.js';

const PRACTICE_WORDS_COUNT = 10;

@Injectable()
export class PracticeService {
  constructor(private readonly statisticsService: StatisticsService) {}
  private percentageExpr() {
    return sql<number>`least(100, round(coalesce(max(${wordProgressTable.correctCount}), 0)::numeric / coalesce(max(${userStatsTable.repetitionsTarget}), 100) * 100))`;
  }

  private filterHavingCondition(filter: Exclude<PracticeFilter, 'random'>) {
    switch (filter) {
      case 'not_learned':
        return sql`${this.percentageExpr()} = 0`;
      case 'poor':
        return sql`${this.percentageExpr()} between 1 and 39`;
      case 'average':
        return sql`${this.percentageExpr()} between 40 and 99`;
      case 'learned':
        return sql`${this.percentageExpr()} = 100`;
      default:
        throw new BadRequestException(
          'Invalid filter. Allowed values: not_learned, poor, average, learned, random',
        );
    }
  }

  async getSession(userId: number, filter?: PracticeFilter) {
    const builder = DB.select({
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
      .where(eq(dictionaryTable.userId, userId))
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
      .leftJoin(
        wordProgressTable,
        and(
          eq(dictionaryTable.userId, wordProgressTable.userId),
          eq(dictionaryTable.wordId, wordProgressTable.wordId),
        ),
      )
      .leftJoin(userStatsTable, eq(dictionaryTable.userId, userStatsTable.userId))
      .groupBy(dictionaryTable.wordId, wordsTable.value)
      .$dynamic();

    const filteredBuilder =
      filter && filter !== 'random'
        ? builder.having(this.filterHavingCondition(filter))
        : builder;

    return filteredBuilder.orderBy(sql`random()`).limit(PRACTICE_WORDS_COUNT);
  }

  private async checkAnswer(dto: VerifyAnswerDto): Promise<boolean> {
    switch (dto.type) {
      case 'choose_translation': {
        const [row] = await DB.select()
          .from(translationsTable)
          .where(
            and(
              eq(translationsTable.wordId, dto.wordId),
              eq(translationsTable.value, String(dto.answer).trim()),
            ),
          );
        return !!row;
      }

      case 'match_definition': {
        const [row] = await DB.select()
          .from(definitionsTable)
          .where(
            and(
              eq(definitionsTable.wordId, dto.wordId),
              eq(definitionsTable.id, Number(dto.answer)),
            ),
          );
        return !!row;
      }

      case 'type_word': {
        const [word] = await DB.select().from(wordsTable).where(eq(wordsTable.id, dto.wordId));
        if (!word) {
          return false;
        }
        return word.value === String(dto.answer).trim().toLowerCase();
      }

      case 'select_all_translations': {
        const rows = await DB.select({ value: translationsTable.value })
          .from(translationsTable)
          .where(eq(translationsTable.wordId, dto.wordId));

        const real = new Set(rows.map((row) => row.value));
        const selected = new Set((dto.answer as string[]).map((value) => value.trim()));

        if (real.size !== selected.size) {
          return false;
        }
        for (const value of real) {
          if (!selected.has(value)) {
            return false;
          }
        }
        return true;
      }

      default:
        throw new BadRequestException(
          'Invalid exercise type. Allowed values: choose_translation, match_definition, type_word, select_all_translations',
        );
    }
  }

  async verify(userId: number, dto: VerifyAnswerDto) {
    const isCorrect = await this.checkAnswer(dto);
    await this.statisticsService.recordAttempt(userId, { wordId: dto.wordId, isCorrect });
    return { isCorrect };
  }
}
