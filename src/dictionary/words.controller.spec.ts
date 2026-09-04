import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

import { WordsController } from './words.controller.js';
import type { DictionaryService } from './dictionary.service.js';

describe('WordsController', () => {
  let service: { findWordSuggestions: ReturnType<typeof vi.fn> };
  let controller: WordsController;

  beforeEach(() => {
    service = { findWordSuggestions: vi.fn() };
    controller = new WordsController(service as unknown as DictionaryService);
  });

  it('delegates to the service with the given value', async () => {
    service.findWordSuggestions.mockResolvedValue({
      wordId: 1,
      word: 'apple',
      definitions: ['fruit'],
      translations: ['яблуко'],
    });

    const result = await controller.findSuggestions('apple');

    expect(service.findWordSuggestions).toHaveBeenCalledWith('apple');
    expect(result).toEqual({
      wordId: 1,
      word: 'apple',
      definitions: ['fruit'],
      translations: ['яблуко'],
    });
  });

  it('returns null when the word is not found', async () => {
    service.findWordSuggestions.mockResolvedValue(null);

    const result = await controller.findSuggestions('unknown');

    expect(result).toBeNull();
  });
});
