import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DictionaryService } from './dictionary.service.js';
import { wordsTable } from '../db/schemas/dictionary.schemas.js';

const { mockSelect, mockInsert, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  },
}));

const CHAIN_METHODS = [
  'from',
  'where',
  'leftJoin',
  'groupBy',
  'orderBy',
  'limit',
  'offset',
  'values',
  'onConflictDoNothing',
  'returning',
] as const;

function chain(result: unknown) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }
  return builder;
}

function rejectingChain(error: unknown) {
  const builder: Record<string, unknown> = {
    then: (_resolve: unknown, reject?: (reason: unknown) => unknown) =>
      Promise.reject(error).catch((e) => {
        if (reject) return reject(e);
        throw e;
      }),
  };
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }
  return builder;
}

describe('DictionaryService', () => {
  let service: DictionaryService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new DictionaryService();
  });

  describe('create', () => {
    it('throws BadRequestException when definitions or translations are empty', async () => {
      await expect(
        service.create(1, { value: 'apple', definitions: [], translations: ['яблуко'] }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(1, { value: 'apple', definitions: ['fruit'], translations: [] }),
      ).rejects.toThrow(BadRequestException);

      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('creates a new word, upserts definitions/translations and inserts the cross-product', async () => {
      mockSelect
        .mockReturnValueOnce(chain([])) // findOrCreateWord: no existing word
        .mockReturnValueOnce(chain([{ id: 10 }, { id: 11 }])) // upsertDefinitions ids
        .mockReturnValueOnce(chain([{ id: 20 }])); // upsertTranslations ids

      mockInsert
        .mockReturnValueOnce(chain([{ id: 1 }])) // insert word, returning
        .mockReturnValueOnce(chain(undefined)) // insert definitions
        .mockReturnValueOnce(chain(undefined)) // insert translations
        .mockReturnValueOnce(chain(undefined)); // insert dictionary rows

      const result = await service.create(1, {
        value: 'apple',
        definitions: ['fruit', 'company'],
        translations: ['яблуко'],
      });

      expect(result).toEqual({ wordId: 1 });

      const dictionaryInsertBuilder = mockInsert.mock.results[3].value as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(dictionaryInsertBuilder.values).toHaveBeenCalledWith([
        { userId: 1, wordId: 1, definitionId: 10, translationId: 20 },
        { userId: 1, wordId: 1, definitionId: 11, translationId: 20 },
      ]);
    });

    it('reuses an existing word instead of creating a duplicate', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 7, value: 'apple' }])) // findOrCreateWord: word already exists
        .mockReturnValueOnce(chain([{ id: 10 }])) // upsertDefinitions ids
        .mockReturnValueOnce(chain([{ id: 20 }])); // upsertTranslations ids

      mockInsert
        .mockReturnValueOnce(chain(undefined)) // insert definitions
        .mockReturnValueOnce(chain(undefined)) // insert translations
        .mockReturnValueOnce(chain(undefined)); // insert dictionary rows

      const result = await service.create(1, {
        value: 'apple',
        definitions: ['fruit'],
        translations: ['яблуко'],
      });

      expect(result).toEqual({ wordId: 7 });
      // No "insert into wordsTable" call — only definitions, translations, dictionary.
      expect(mockInsert).toHaveBeenCalledTimes(3);
    });

    it('normalizes the word value (trims and lowercases) before looking it up', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 7, value: 'apple' }]))
        .mockReturnValueOnce(chain([{ id: 10 }]))
        .mockReturnValueOnce(chain([{ id: 20 }]));

      mockInsert
        .mockReturnValueOnce(chain(undefined))
        .mockReturnValueOnce(chain(undefined))
        .mockReturnValueOnce(chain(undefined));

      await service.create(1, {
        value: '  APPLE  ',
        definitions: ['fruit'],
        translations: ['яблуко'],
      });

      const wordSelectBuilder = mockSelect.mock.results[0].value as {
        where: ReturnType<typeof vi.fn>;
      };
      expect(wordSelectBuilder.where).toHaveBeenCalledWith(eq(wordsTable.value, 'apple'));
    });

    it('falls back to the concurrently created word if the insert hits a unique conflict', async () => {
      mockSelect
        .mockReturnValueOnce(chain([])) // findOrCreateWord: no existing word yet
        .mockReturnValueOnce(chain([{ id: 9, value: 'apple' }])) // re-select after conflict
        .mockReturnValueOnce(chain([{ id: 10 }])) // upsertDefinitions ids
        .mockReturnValueOnce(chain([{ id: 20 }])); // upsertTranslations ids

      mockInsert
        .mockReturnValueOnce(rejectingChain(new Error('duplicate key value violates unique constraint')))
        .mockReturnValueOnce(chain(undefined)) // insert definitions
        .mockReturnValueOnce(chain(undefined)) // insert translations
        .mockReturnValueOnce(chain(undefined)); // insert dictionary rows

      const result = await service.create(1, {
        value: 'apple',
        definitions: ['fruit'],
        translations: ['яблуко'],
      });

      expect(result).toEqual({ wordId: 9 });
    });

    it('rethrows the insert error when the word still does not exist after a conflict', async () => {
      const insertError = new Error('some other database error');
      mockSelect
        .mockReturnValueOnce(chain([])) // findOrCreateWord: no existing word
        .mockReturnValueOnce(chain([])); // re-select after failed insert: still nothing

      mockInsert.mockReturnValueOnce(rejectingChain(insertError));

      await expect(
        service.create(1, { value: 'apple', definitions: ['fruit'], translations: ['яблуко'] }),
      ).rejects.toThrow(insertError);
    });

    it('throws BadRequestException when a translation exceeds 255 characters', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 1, value: 'apple' }])) // findOrCreateWord
        .mockReturnValueOnce(chain([{ id: 10 }])); // upsertDefinitions ids
      mockInsert.mockReturnValueOnce(chain(undefined)); // upsertDefinitions insert

      const tooLong = 'a'.repeat(256);

      await expect(
        service.create(1, { value: 'apple', definitions: ['fruit'], translations: [tooLong] }),
      ).rejects.toThrow(BadRequestException);

      // Only the definitions insert happened — never a translations or dictionary insert.
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('returns grouped data with pagination', async () => {
      mockSelect
        .mockReturnValueOnce(
          chain([{ wordId: 1, word: 'apple', definitions: ['fruit'], translations: ['яблуко'] }]),
        )
        .mockReturnValueOnce(chain([{ total: 1 }]));

      const result = await service.findAll(1, {});

      expect(result).toEqual({
        data: [{ wordId: 1, word: 'apple', definitions: ['fruit'], translations: ['яблуко'] }],
        total: 1,
        pages: 1,
        page: 1,
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the word is not in the dictionary', async () => {
      mockSelect.mockReturnValueOnce(chain([]));

      await expect(
        service.update(1, 99, { definitions: ['fruit'], translations: ['яблуко'] }),
      ).rejects.toThrow(NotFoundException);

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when definitions or translations are empty', async () => {
      await expect(
        service.update(1, 5, { definitions: [], translations: ['яблуко'] }),
      ).rejects.toThrow(BadRequestException);

      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('deletes removed pairs and inserts new pairs', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 100, definitionId: 10, translationId: 20 }])) // existing rows
        .mockReturnValueOnce(chain([{ id: 10 }])) // upsertDefinitions ids (unchanged)
        .mockReturnValueOnce(chain([{ id: 21 }])); // upsertTranslations ids (new translation)

      mockInsert
        .mockReturnValueOnce(chain(undefined)) // insert definitions
        .mockReturnValueOnce(chain(undefined)) // insert translations
        .mockReturnValueOnce(chain(undefined)); // insert new pairs

      mockDelete.mockReturnValueOnce(chain(undefined)); // delete removed pairs

      await service.update(1, 5, { definitions: ['fruit'], translations: ['новий переклад'] });

      expect(mockDelete).toHaveBeenCalledTimes(1);

      const insertPairsBuilder = mockInsert.mock.results[2].value as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertPairsBuilder.values).toHaveBeenCalledWith([
        { userId: 1, wordId: 5, definitionId: 10, translationId: 21 },
      ]);
    });

    it('does nothing when the new pairs are identical to the existing ones', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 100, definitionId: 10, translationId: 20 }])) // existing rows
        .mockReturnValueOnce(chain([{ id: 10 }])) // upsertDefinitions ids (unchanged)
        .mockReturnValueOnce(chain([{ id: 20 }])); // upsertTranslations ids (unchanged)

      mockInsert
        .mockReturnValueOnce(chain(undefined)) // insert definitions (onConflictDoNothing)
        .mockReturnValueOnce(chain(undefined)); // insert translations (onConflictDoNothing)

      await service.update(1, 5, { definitions: ['fruit'], translations: ['яблуко'] });

      expect(mockDelete).not.toHaveBeenCalled();
      // Only the two upsert inserts — no dictionary-row insert since nothing is new.
      expect(mockInsert).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when a translation exceeds 255 characters', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 100, definitionId: 10, translationId: 20 }])) // existing rows
        .mockReturnValueOnce(chain([{ id: 10 }])); // upsertDefinitions ids
      mockInsert.mockReturnValueOnce(chain(undefined)); // upsertDefinitions insert

      const tooLong = 'a'.repeat(256);

      await expect(
        service.update(1, 5, { definitions: ['fruit'], translations: [tooLong] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      mockDelete.mockReturnValueOnce(chain([]));

      await expect(service.remove(1, 99)).rejects.toThrow(NotFoundException);
    });

    it('removes the word from the dictionary', async () => {
      mockDelete.mockReturnValueOnce(chain([{ id: 100 }]));

      await expect(service.remove(1, 5)).resolves.toBeUndefined();
    });
  });

  describe('findWordSuggestions', () => {
    it('returns null when the word does not exist', async () => {
      mockSelect.mockReturnValueOnce(chain([]));

      const result = await service.findWordSuggestions('unknown');

      expect(result).toBeNull();
    });

    it('returns aggregated definitions and translations when the word exists', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 1, value: 'apple' }]))
        .mockReturnValueOnce(
          chain([{ wordId: 1, word: 'apple', definitions: ['fruit'], translations: ['яблуко'] }]),
        );

      const result = await service.findWordSuggestions('apple');

      expect(result).toEqual({
        wordId: 1,
        word: 'apple',
        definitions: ['fruit'],
        translations: ['яблуко'],
      });
    });

    it('normalizes the value (trims and lowercases) so casing does not affect lookup', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 1, value: 'bank' }]))
        .mockReturnValueOnce(
          chain([{ wordId: 1, word: 'bank', definitions: ['a financial institution'], translations: ['банк'] }]),
        );

      const result = await service.findWordSuggestions('  Bank  ');

      const wordSelectBuilder = mockSelect.mock.results[0].value as {
        where: ReturnType<typeof vi.fn>;
      };
      expect(wordSelectBuilder.where).toHaveBeenCalledWith(eq(wordsTable.value, 'bank'));
      expect(result).toEqual({
        wordId: 1,
        word: 'bank',
        definitions: ['a financial institution'],
        translations: ['банк'],
      });
    });
  });
});
