import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StatisticsModule } from '../statistics/statistics.module.js';
import { PracticeController } from './practice.controller.js';
import { PracticeService } from './practice.service.js';

@Module({
  imports: [AuthModule, StatisticsModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
