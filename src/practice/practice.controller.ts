import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { PracticeService } from './practice.service.js';
import { VerifyAnswerDto } from './dto.js';
import type { PracticeFilter } from './dto.js';

@UseGuards(AuthGuard)
@Controller('practice')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Get('session')
  getSession(@Req() req: AuthenticatedRequest, @Query('filter') filter?: PracticeFilter) {
    return this.practiceService.getSession(req.user.id, filter);
  }

  @Post('verify')
  verify(@Req() req: AuthenticatedRequest, @Body() dto: VerifyAnswerDto) {
    return this.practiceService.verify(req.user.id, dto);
  }
}
