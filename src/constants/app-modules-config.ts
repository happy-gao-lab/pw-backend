import { globalThrottler } from './index.js';

export const observeModule = {
  appKey: 'YOUR_APP_KEY',
  appSecret: 'YOUR_APP_SECRET',
  serviceId: 'pw-backend',
};

export const loggerModule = {
  pinoHttp: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
  },
};

export const throttlerModule = {
  ttl: globalThrottler.TTL,
  limit: globalThrottler.LIMIT,
};
