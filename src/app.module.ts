import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DictionaryModule } from './dictionary/dictionary.module.js';
import { StatisticsModule } from './statistics/statistics.module.js';
import { PracticeModule } from './practice/practice.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'pw-backend',
    }),
    AuthModule,
    UsersModule,
    DictionaryModule,
    StatisticsModule,
    PracticeModule,
  ],
})
export class AppModule {}
