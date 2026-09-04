import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StatisticsController } from './statistics.controller.js';
import { LeaderboardController } from './leaderboard.controller.js';
import { StatisticsService } from './statistics.service.js';

@Module({
  imports: [AuthModule],
  controllers: [StatisticsController, LeaderboardController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
