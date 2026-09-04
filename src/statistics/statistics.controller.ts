import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { StatisticsService } from './statistics.service.js';
import { RecordAttemptDto } from './dto.js';

@UseGuards(AuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Post('attempts')
  recordAttempt(@Req() req: AuthenticatedRequest, @Body() dto: RecordAttemptDto) {
    return this.statisticsService.recordAttempt(req.user.id, dto);
  }

  @Get()
  getStats(@Req() req: AuthenticatedRequest) {
    return this.statisticsService.getStats(req.user.id);
  }
}
