import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import {
  loggerModule,
  observeModule,
  throttlerModule,
} from './constants/app-modules-config.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GlobalDictionaryModule } from './modules/global-dictionary/global-dictionary.module.js';
import { UserDictionaryModule } from './modules/user-dictionary/user-dictionary.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot(observeModule),
    LoggerModule.forRoot(loggerModule),
    ThrottlerModule.forRoot([throttlerModule]),

    AuthModule,
    GlobalDictionaryModule,
    UserDictionaryModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
