import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

import { LeaderboardController } from './leaderboard.controller.js';
import type { StatisticsService } from './statistics.service.js';

describe('LeaderboardController', () => {
  let service: { getLeaderboard: ReturnType<typeof vi.fn> };
  let controller: LeaderboardController;

  beforeEach(() => {
    service = { getLeaderboard: vi.fn() };
    controller = new LeaderboardController(service as unknown as StatisticsService);
  });

  it('delegates to the service', async () => {
    const leaderboard = [{ rank: 1, name: 'Top User', totalScore: 50 }];
    service.getLeaderboard.mockResolvedValue(leaderboard);

    const result = await controller.getLeaderboard();

    expect(service.getLeaderboard).toHaveBeenCalled();
    expect(result).toEqual(leaderboard);
  });
});
