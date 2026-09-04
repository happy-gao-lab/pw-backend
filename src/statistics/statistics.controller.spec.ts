import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

import { StatisticsController } from './statistics.controller.js';
import type { StatisticsService } from './statistics.service.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';

function makeRequest(userId: number): AuthenticatedRequest {
  return { user: { id: userId, email: 'user@example.com' } } as AuthenticatedRequest;
}

describe('StatisticsController', () => {
  let service: {
    recordAttempt: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
  };
  let controller: StatisticsController;

  beforeEach(() => {
    service = { recordAttempt: vi.fn(), getStats: vi.fn() };
    controller = new StatisticsController(service as unknown as StatisticsService);
  });

  it('recordAttempt delegates to the service with the authenticated user id', async () => {
    const dto = { wordId: 5, isCorrect: true };
    service.recordAttempt.mockResolvedValue({
      wordId: 5,
      correctCount: 1,
      incorrectCount: 0,
      percentage: 1,
    });

    const result = await controller.recordAttempt(makeRequest(42), dto);

    expect(service.recordAttempt).toHaveBeenCalledWith(42, dto);
    expect(result).toEqual({ wordId: 5, correctCount: 1, incorrectCount: 0, percentage: 1 });
  });

  it('getStats delegates to the service with the authenticated user id', async () => {
    const stats = {
      repetitionsTarget: 100,
      currentStreak: 1,
      longestStreak: 1,
      lastPracticedAt: '2024-01-15T12:00:00.000Z',
      words: [],
    };
    service.getStats.mockResolvedValue(stats);

    const result = await controller.getStats(makeRequest(42));

    expect(service.getStats).toHaveBeenCalledWith(42);
    expect(result).toEqual(stats);
  });
});
