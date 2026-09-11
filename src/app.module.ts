import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module.js';
import { globalThrottler } from './constants/index.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

const observeModule = {
  appKey: 'YOUR_APP_KEY',
  appSecret: 'YOUR_APP_SECRET',
  serviceId: 'pw-backend',
};

const loggerModule = {
  pinoHttp: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
  },
};

const throttlerModule = {
  ttl: globalThrottler.TTL,
  limit: globalThrottler.LIMIT,
};

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot(observeModule),
    LoggerModule.forRoot(loggerModule),
    ThrottlerModule.forRoot([throttlerModule]),
    AuthModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
