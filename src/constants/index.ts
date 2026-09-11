export const BCRYPT_SALT_ROUNDS = 10;

export const MIN_PASSWORD_LENGTH = 6;

export const globalThrottler = {
  LIMIT: 10,
  TTL: 60_000,
};

export const ACCESS_TOKEN_EXPIRES_IN_MS = 900_000;

export const REFRESH_TOKEN_EXPIRES_IN_MS = 2_592_000_000;

export const authThrottler = {
  LIMIT: 5,
  TTL: 60_000,
  LOCKOUT_DURATION_MS: 900_000,
};
