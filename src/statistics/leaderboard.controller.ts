import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { StatisticsService } from './statistics.service.js';

@UseGuards(AuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  getLeaderboard() {
    return this.statisticsService.getLeaderboard();
  }
}
