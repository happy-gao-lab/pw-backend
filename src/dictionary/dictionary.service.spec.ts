import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DictionaryService } from './dictionary.service.js';

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

describe('DictionaryService', () => {
  let service: DictionaryService;

  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
