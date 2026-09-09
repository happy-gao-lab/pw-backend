export const BCRYPT_SALT_ROUNDS = 10;

export const MIN_PASSWORD_LENGTH = 6;

export const globalThrottler = {
  LIMIT: 10,
  TTL: 60_000,
};

export const authThrottler = {
  LIMIT: 5,
  TTL: 60_000,
  LOCKOUT_DURATION_MS: 900_000,
};
