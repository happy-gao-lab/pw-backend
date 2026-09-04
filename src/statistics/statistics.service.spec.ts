import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatisticsService } from './statistics.service.js';

const { mockSelect, mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

const CHAIN_METHODS = ['from', 'where', 'values', 'set', 'returning'] as const;

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

const NOW = '2024-01-15T12:00:00.000Z';

describe('StatisticsService', () => {
  let service: StatisticsService;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    service = new StatisticsService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordAttempt', () => {
    it('lazily creates progress and stats on the first attempt (correct)', async () => {
      mockSelect
        .mockReturnValueOnce(chain([])) // findOrCreateWordProgress: none yet
        .mockReturnValueOnce(chain([])); // findOrCreateUserStats: none yet

      mockInsert
        .mockReturnValueOnce(
          chain([{ id: 1, userId: 1, wordId: 5, correctCount: 0, incorrectCount: 0 }]),
        ) // create word progress
        .mockReturnValueOnce(
          chain([
            {
              userId: 1,
              repetitionsTarget: 100,
              currentStreak: 0,
              longestStreak: 0,
              lastPracticedAt: null,
            },
          ]),
        ); // create user stats

      mockUpdate
        .mockReturnValueOnce(chain([{ correctCount: 1, incorrectCount: 0 }])) // update progress
        .mockReturnValueOnce(chain(undefined)); // update stats

      const result = await service.recordAttempt(1, { wordId: 5, isCorrect: true });

      expect(result).toEqual({
        wordId: 5,
        correctCount: 1,
        incorrectCount: 0,
        percentage: 1,
      });

      const statsUpdateBuilder = mockUpdate.mock.results[1].value;
      expect(statsUpdateBuilder.set).toHaveBeenCalledWith({
        currentStreak: 1,
        longestStreak: 1,
        lastPracticedAt: NOW,
      });
    });

    it('records an incorrect attempt without touching correctCount', async () => {
      mockSelect
        .mockReturnValueOnce(
          chain([{ id: 1, userId: 1, wordId: 5, correctCount: 3, incorrectCount: 2 }]),
        )
        .mockReturnValueOnce(
          chain([
            {
              userId: 1,
              repetitionsTarget: 100,
              currentStreak: 2,
              longestStreak: 4,
              lastPracticedAt: NOW,
            },
          ]),
        );

      mockUpdate
        .mockReturnValueOnce(chain([{ correctCount: 3, incorrectCount: 3 }]))
        .mockReturnValueOnce(chain(undefined));

      const result = await service.recordAttempt(1, { wordId: 5, isCorrect: false });

      const progressUpdateBuilder = mockUpdate.mock.results[0].value;
      expect(progressUpdateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ correctCount: 3, incorrectCount: 3 }),
      );
      expect(result).toEqual({
        wordId: 5,
        correctCount: 3,
        incorrectCount: 3,
        percentage: 3,
      });
    });

    it('leaves the streak unchanged when already practiced today', async () => {
      mockSelect
        .mockReturnValueOnce(chain([{ id: 1, correctCount: 1, incorrectCount: 0 }]))
        .mockReturnValueOnce(
          chain([
            { userId: 1, repetitionsTarget: 100, currentStreak: 3, longestStreak: 5, lastPracticedAt: NOW },
          ]),
        );

      mockUpdate
        .mockReturnValueOnce(chain([{ correctCount: 2, incorrectCount: 0 }]))
        .mockReturnValueOnce(chain(undefined));

      await service.recordAttempt(1, { wordId: 5, isCorrect: true });

      const statsUpdateBuilder = mockUpdate.mock.results[1].value;
      expect(statsUpdateBuilder.set).toHaveBeenCalledWith({
        currentStreak: 3,
        longestStreak: 5,
        lastPracticedAt: NOW,
      });
    });

    it('increments the streak when the last practice was yesterday', async () => {
      const yesterday = '2024-01-14T09:00:00.000Z';
      mockSelect
        .mockReturnValueOnce(chain([{ id: 1, correctCount: 1, incorrectCount: 0 }]))
        .mockReturnValueOnce(
          chain([
            {
              userId: 1,
              repetitionsTarget: 100,
              currentStreak: 3,
              longestStreak: 3,
              lastPracticedAt: yesterday,
            },
          ]),
        );

      mockUpdate
        .mockReturnValueOnce(chain([{ correctCount: 2, incorrectCount: 0 }]))
        .mockReturnValueOnce(chain(undefined));

      await service.recordAttempt(1, { wordId: 5, isCorrect: true });

      const statsUpdateBuilder = mockUpdate.mock.results[1].value;
      expect(statsUpdateBuilder.set).toHaveBeenCalledWith({
        currentStreak: 4,
        longestStreak: 4,
        lastPracticedAt: NOW,
      });
    });

    it('resets the streak to 1 when there was a gap of more than one day', async () => {
      const fiveDaysAgo = '2024-01-10T09:00:00.000Z';
      mockSelect
        .mockReturnValueOnce(chain([{ id: 1, correctCount: 1, incorrectCount: 0 }]))
        .mockReturnValueOnce(
          chain([
            {
              userId: 1,
              repetitionsTarget: 100,
              currentStreak: 7,
              longestStreak: 7,
              lastPracticedAt: fiveDaysAgo,
            },
          ]),
        );

      mockUpdate
        .mockReturnValueOnce(chain([{ correctCount: 2, incorrectCount: 0 }]))
        .mockReturnValueOnce(chain(undefined));

      await service.recordAttempt(1, { wordId: 5, isCorrect: true });

      const statsUpdateBuilder = mockUpdate.mock.results[1].value;
      expect(statsUpdateBuilder.set).toHaveBeenCalledWith({
        currentStreak: 1,
        longestStreak: 7,
        lastPracticedAt: NOW,
      });
    });
  });

  describe('getStats', () => {
    it('returns user stats with per-word percentages sorted ascending', async () => {
      mockSelect
        .mockReturnValueOnce(
          chain([
            {
              userId: 1,
              repetitionsTarget: 100,
              currentStreak: 2,
              longestStreak: 5,
              lastPracticedAt: NOW,
            },
          ]),
        )
        .mockReturnValueOnce(
          chain([
            { wordId: 1, correctCount: 80, incorrectCount: 1, lastPracticedAt: NOW },
            { wordId: 2, correctCount: 10, incorrectCount: 5, lastPracticedAt: NOW },
            { wordId: 3, correctCount: 100, incorrectCount: 0, lastPracticedAt: NOW },
          ]),
        );

      const result = await service.getStats(1);

      expect(result).toEqual({
        repetitionsTarget: 100,
        currentStreak: 2,
        longestStreak: 5,
        lastPracticedAt: NOW,
        words: [
          { wordId: 2, correctCount: 10, incorrectCount: 5, lastPracticedAt: NOW, percentage: 10 },
          { wordId: 1, correctCount: 80, incorrectCount: 1, lastPracticedAt: NOW, percentage: 80 },
          { wordId: 3, correctCount: 100, incorrectCount: 0, lastPracticedAt: NOW, percentage: 100 },
        ],
      });
    });

    it('lazily creates user stats when none exist yet', async () => {
      mockSelect.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain([]));

      mockInsert.mockReturnValueOnce(
        chain([
          {
            userId: 1,
            repetitionsTarget: 100,
            currentStreak: 0,
            longestStreak: 0,
            lastPracticedAt: null,
          },
        ]),
      );

      const result = await service.getStats(1);

      expect(result).toEqual({
        repetitionsTarget: 100,
        currentStreak: 0,
        longestStreak: 0,
        lastPracticedAt: null,
        words: [],
      });
    });
  });
});
