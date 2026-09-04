import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PracticeService } from './practice.service.js';
import type { StatisticsService } from '../statistics/statistics.service.js';

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: {
    select: mockSelect,
  },
}));

const CHAIN_METHODS = [
  'from',
  'where',
  'leftJoin',
  'groupBy',
  'having',
  '$dynamic',
  'orderBy',
  'limit',
] as const;

function chain(result: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {} as never;
  (builder as Record<string, unknown>).then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }
  return builder;
}

describe('PracticeService', () => {
  let statisticsService: { recordAttempt: ReturnType<typeof vi.fn> };
  let service: PracticeService;

  beforeEach(() => {
    vi.resetAllMocks();
    statisticsService = { recordAttempt: vi.fn() };
    service = new PracticeService(statisticsService as unknown as StatisticsService);
  });

  describe('getSession', () => {
    it('returns up to 10 random words without a filter', async () => {
      const resultChain = chain([{ wordId: 1, word: 'apple', definitions: ['fruit'], translations: ['яблуко'] }]);
      mockSelect.mockReturnValueOnce(resultChain);

      const result = await service.getSession(1);

      expect(resultChain.having).not.toHaveBeenCalled();
      expect(resultChain.orderBy).toHaveBeenCalledTimes(1);
      expect(resultChain.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual([
        { wordId: 1, word: 'apple', definitions: ['fruit'], translations: ['яблуко'] },
      ]);
    });

    it('does not apply .having() for the "random" filter', async () => {
      const resultChain = chain([]);
      mockSelect.mockReturnValueOnce(resultChain);

      await service.getSession(1, 'random');

      expect(resultChain.having).not.toHaveBeenCalled();
    });

    it('applies .having() for a learning-progress filter', async () => {
      const resultChain = chain([]);
      mockSelect.mockReturnValueOnce(resultChain);

      await service.getSession(1, 'learned');

      expect(resultChain.having).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException for an invalid filter value', async () => {
      mockSelect.mockReturnValueOnce(chain(undefined));

      await expect(service.getSession(1, 'invalid' as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verify', () => {
    it('choose_translation: correct when the translation belongs to the word', async () => {
      mockSelect.mockReturnValueOnce(chain([{ id: 1, wordId: 5, value: 'банк' }]));
      statisticsService.recordAttempt.mockResolvedValue(undefined);

      const result = await service.verify(1, {
        wordId: 5,
        type: 'choose_translation',
        answer: 'банк',
      });

      expect(result).toEqual({ isCorrect: true });
      expect(statisticsService.recordAttempt).toHaveBeenCalledWith(1, {
        wordId: 5,
        isCorrect: true,
      });
    });

    it('choose_translation: incorrect when the translation does not belong to the word', async () => {
      mockSelect.mockReturnValueOnce(chain([]));

      const result = await service.verify(1, {
        wordId: 5,
        type: 'choose_translation',
        answer: 'кажан',
      });

      expect(result).toEqual({ isCorrect: false });
      expect(statisticsService.recordAttempt).toHaveBeenCalledWith(1, {
        wordId: 5,
        isCorrect: false,
      });
    });

    it('match_definition: correct when the definition belongs to the word', async () => {
      mockSelect.mockReturnValueOnce(chain([{ id: 10, wordId: 5 }]));

      const result = await service.verify(1, {
        wordId: 5,
        type: 'match_definition',
        answer: 10,
      });

      expect(result).toEqual({ isCorrect: true });
    });

    it('match_definition: incorrect when the definition belongs to another word', async () => {
      mockSelect.mockReturnValueOnce(chain([]));

      const result = await service.verify(1, {
        wordId: 5,
        type: 'match_definition',
        answer: 99,
      });

      expect(result).toEqual({ isCorrect: false });
    });

    it('type_word: correct when the answer matches the word value (normalized)', async () => {
      mockSelect.mockReturnValueOnce(chain([{ id: 5, value: 'bank' }]));

      const result = await service.verify(1, {
        wordId: 5,
        type: 'type_word',
        answer: '  Bank  ',
      });

      expect(result).toEqual({ isCorrect: true });
    });

    it('type_word: incorrect when the answer does not match', async () => {
      mockSelect.mockReturnValueOnce(chain([{ id: 5, value: 'bank' }]));

      const result = await service.verify(1, { wordId: 5, type: 'type_word', answer: 'bnak' });

      expect(result).toEqual({ isCorrect: false });
    });

    it('type_word: incorrect when the word does not exist', async () => {
      mockSelect.mockReturnValueOnce(chain([]));

      const result = await service.verify(1, { wordId: 999, type: 'type_word', answer: 'bank' });

      expect(result).toEqual({ isCorrect: false });
    });

    it('select_all_translations: correct when the full set matches exactly', async () => {
      mockSelect.mockReturnValueOnce(chain([{ value: 'банк' }, { value: 'берег' }]));

      const result = await service.verify(1, {
        wordId: 5,
        type: 'select_all_translations',
        answer: ['банк', 'берег'],
      });

      expect(result).toEqual({ isCorrect: true });
    });

    it('select_all_translations: incorrect when a translation is missing', async () => {
      mockSelect.mockReturnValueOnce(chain([{ value: 'банк' }, { value: 'берег' }]));

      const result = await service.verify(1, {
        wordId: 5,
        type: 'select_all_translations',
        answer: ['банк'],
      });

      expect(result).toEqual({ isCorrect: false });
    });

    it('select_all_translations: incorrect when an extra wrong translation is included', async () => {
      mockSelect.mockReturnValueOnce(chain([{ value: 'банк' }, { value: 'берег' }]));

      const result = await service.verify(1, {
        wordId: 5,
        type: 'select_all_translations',
        answer: ['банк', 'берег', 'кажан'],
      });

      expect(result).toEqual({ isCorrect: false });
    });

    it('throws BadRequestException for an unknown exercise type', async () => {
      await expect(
        service.verify(1, { wordId: 5, type: 'unknown' as never, answer: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
