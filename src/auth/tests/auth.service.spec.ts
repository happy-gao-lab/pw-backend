import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errors } from '../../constants/errors.js';
import { AuthService } from '../auth.service.js';
import { GoogleSignInDto, SignInDto, SignUpDto } from '../dto.js';
import { SessionService } from '../session.service.js';

const { hash, compare } = vi.hoisted(() => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('bcrypt', () => ({ hash, compare }));

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(function OAuth2Client() {
    return { verifyIdToken };
  }),
}));

const mockDB = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ default: mockDB }));

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function insertChain(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function insertConflictChain() {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function updateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function updateReturningChain(result: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function uniqueViolation() {
  return Object.assign(new Error('duplicate key value'), { code: '23505' });
}

function futureDate() {
  return new Date(Date.now() + 60_000).toISOString();
}

function pastDate() {
  return new Date(Date.now() - 60_000).toISOString();
}

const signUpDto: SignUpDto = {
  username: 'newbie',
  email: 'newbie@example.com',
  password: 'password123',
};

const signInDto: SignInDto = {
  email: 'newbie@example.com',
  password: 'password123',
};

const googleDto: GoogleSignInDto = { idToken: 'google-id-token' };

const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

describe('AuthService', () => {
  let sessionService: {
    createSession: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    refreshSession: ReturnType<typeof vi.fn>;
  };
  let logger: {
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService = {
      createSession: vi.fn().mockResolvedValue(tokens),
      revokeSession: vi.fn(),
      refreshSession: vi.fn().mockResolvedValue(tokens),
    };
    logger = { warn: vi.fn(), error: vi.fn() };
    service = new AuthService(
      sessionService as unknown as SessionService,
      logger as unknown as Logger,
    );
  });

  describe('localSignUp', () => {
    it('throws ConflictException if the email is already in use', async () => {
      mockDB.select.mockReturnValue(selectChain([{ id: 1 }]));

      await expect(service.localSignUp(signUpDto)).rejects.toThrow(
        new ConflictException(errors.EMAIL_IN_USE),
      );
    });

    it('throws ConflictException if a concurrent sign-up won the race', async () => {
      mockDB.select.mockReturnValue(selectChain([]));
      hash.mockResolvedValue('hashed-password');
      mockDB.transaction.mockRejectedValue(uniqueViolation());

      await expect(service.localSignUp(signUpDto)).rejects.toThrow(
        new ConflictException(errors.EMAIL_IN_USE),
      );
    });

    it('rethrows an error that is not a unique violation', async () => {
      mockDB.select.mockReturnValue(selectChain([]));
      hash.mockResolvedValue('hashed-password');
      mockDB.transaction.mockRejectedValue(new Error('connection lost'));

      await expect(service.localSignUp(signUpDto)).rejects.toThrow(
        'connection lost',
      );
    });

    it('throws InternalServerErrorException if the user insert fails', async () => {
      mockDB.select.mockReturnValue(selectChain([]));
      hash.mockResolvedValue('hashed-password');
      const tx = { insert: vi.fn().mockReturnValue(insertChain([])) };
      mockDB.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(tx),
      );

      await expect(service.localSignUp(signUpDto)).rejects.toThrow(
        new InternalServerErrorException(errors.SOMETHING_WENT_WRONG),
      );
    });

    it('throws InternalServerErrorException if the identity insert fails', async () => {
      mockDB.select.mockReturnValue(selectChain([]));
      hash.mockResolvedValue('hashed-password');
      const tx = {
        insert: vi
          .fn()
          .mockReturnValueOnce(insertChain([{ id: 1 }]))
          .mockReturnValueOnce(insertChain([])),
      };
      mockDB.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(tx),
      );

      await expect(service.localSignUp(signUpDto)).rejects.toThrow(
        new InternalServerErrorException(errors.SOMETHING_WENT_WRONG),
      );
    });

    it('creates the user and identity, then opens a session', async () => {
      mockDB.select.mockReturnValue(selectChain([]));
      hash.mockResolvedValue('hashed-password');
      const tx = {
        insert: vi
          .fn()
          .mockReturnValueOnce(insertChain([{ id: 1 }]))
          .mockReturnValueOnce(insertChain([{ id: 1 }])),
      };
      mockDB.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(tx),
      );

      const result = await service.localSignUp(signUpDto);

      expect(result).toEqual(tokens);
      expect(sessionService.createSession).toHaveBeenCalledWith(1);
    });
  });

  describe('localSignIn', () => {
    it('throws UnauthorizedException if the user does not exist', async () => {
      mockDB.select.mockReturnValueOnce(selectChain([]));

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_CREDENTIALS),
      );
    });

    it('throws UnauthorizedException if the account is locked', async () => {
      mockDB.select.mockReturnValueOnce(
        selectChain([{ id: 1, lockedUntil: futureDate() }]),
      );

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.ACCOUNT_LOCKED),
      );
    });

    it('resets the attempts counter once the lock has expired', async () => {
      mockDB.select
        .mockReturnValueOnce(selectChain([{ id: 1, lockedUntil: pastDate() }]))
        .mockReturnValueOnce(selectChain([]));
      mockDB.update.mockReturnValue(updateChain());

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_CREDENTIALS),
      );
      expect(mockDB.update).toHaveBeenCalledTimes(1);
    });

    it('throws UnauthorizedException if there is no local identity', async () => {
      mockDB.select
        .mockReturnValueOnce(selectChain([{ id: 1, lockedUntil: null }]))
        .mockReturnValueOnce(selectChain([]));

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_CREDENTIALS),
      );
    });

    it('throws UnauthorizedException if the password is invalid', async () => {
      mockDB.select
        .mockReturnValueOnce(selectChain([{ id: 1, lockedUntil: null }]))
        .mockReturnValueOnce(selectChain([{ passwordHash: 'hashed' }]));
      compare.mockResolvedValue(false);
      mockDB.update.mockReturnValue(
        updateReturningChain([{ failedLoginAttempts: 1 }]),
      );

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_CREDENTIALS),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { userId: 1, attempts: 1 },
        'Sign-in attempt with invalid password',
      );
      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('opens a session on valid credentials', async () => {
      mockDB.select
        .mockReturnValueOnce(selectChain([{ id: 1, lockedUntil: null }]))
        .mockReturnValueOnce(selectChain([{ passwordHash: 'hashed' }]));
      compare.mockResolvedValue(true);
      mockDB.update.mockReturnValue(updateChain());

      const result = await service.localSignIn(signInDto);

      expect(result).toEqual(tokens);
      expect(sessionService.createSession).toHaveBeenCalledWith(1);
    });
  });

  describe('logout', () => {
    it('delegates to sessionService.revokeSession', async () => {
      await service.logout(10);

      expect(sessionService.revokeSession).toHaveBeenCalledWith(10);
    });
  });

  describe('refresh', () => {
    it('delegates to sessionService.refreshSession', async () => {
      const result = await service.refresh({ refreshToken: 'refresh-token' });

      expect(result).toEqual(tokens);
      expect(sessionService.refreshSession).toHaveBeenCalledWith(
        'refresh-token',
      );
    });
  });

  describe('googleAuth', () => {
    it('throws UnauthorizedException if the id token cannot be verified', async () => {
      verifyIdToken.mockRejectedValue(new Error('invalid token'));

      await expect(service.googleAuth(googleDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('throws UnauthorizedException if the token payload is missing sub/email', async () => {
      verifyIdToken.mockResolvedValue({ getPayload: () => ({}) });

      await expect(service.googleAuth(googleDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('throws UnauthorizedException if the google email is not verified', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'user@example.com',
          email_verified: false,
        }),
      });
      mockDB.select.mockReturnValueOnce(selectChain([]));

      await expect(service.googleAuth(googleDto)).rejects.toThrow(
        new UnauthorizedException(errors.EMAIL_NOT_VERIFIED),
      );
    });

    it('signs in an existing google identity without checking the email', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'user@example.com',
          email_verified: false,
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([{ userId: 1 }]))
        .mockReturnValueOnce(selectChain([{ id: 1, lockedUntil: null }]));
      mockDB.update.mockReturnValue(updateChain());

      const result = await service.googleAuth(googleDto);

      expect(result).toEqual(tokens);
      expect(mockDB.insert).not.toHaveBeenCalled();
      expect(mockDB.transaction).not.toHaveBeenCalled();
      expect(sessionService.createSession).toHaveBeenCalledWith(1);
    });

    it('links a google identity to an existing user found by email', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-2',
          email: 'user@example.com',
          email_verified: true,
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ id: 2 }]))
        .mockReturnValueOnce(selectChain([{ id: 2, lockedUntil: null }]));
      mockDB.insert.mockReturnValue(insertConflictChain());
      mockDB.update.mockReturnValue(updateChain());

      const result = await service.googleAuth(googleDto);

      expect(result).toEqual(tokens);
      expect(mockDB.insert).toHaveBeenCalledTimes(1);
      expect(sessionService.createSession).toHaveBeenCalledWith(2);
    });

    it('creates a new user when no identity or email match exists', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-3',
          email: 'brandnew@example.com',
          email_verified: true,
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ id: 3, lockedUntil: null }]));
      const tx = {
        insert: vi
          .fn()
          .mockReturnValueOnce(insertChain([{ id: 3 }]))
          .mockReturnValueOnce(insertChain([{ id: 1 }])),
      };
      mockDB.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(tx),
      );
      mockDB.update.mockReturnValue(updateChain());

      const result = await service.googleAuth(googleDto);

      expect(result).toEqual(tokens);
      expect(mockDB.transaction).toHaveBeenCalledTimes(1);
      expect(sessionService.createSession).toHaveBeenCalledWith(3);
    });

    it('reuses the user created by a concurrent request on a unique violation', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-4',
          email: 'racer@example.com',
          email_verified: true,
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ id: 4 }]))
        .mockReturnValueOnce(selectChain([{ id: 4, lockedUntil: null }]));
      mockDB.transaction.mockRejectedValue(uniqueViolation());
      mockDB.update.mockReturnValue(updateChain());

      const result = await service.googleAuth(googleDto);

      expect(result).toEqual(tokens);
      expect(sessionService.createSession).toHaveBeenCalledWith(4);
    });

    it('throws InternalServerErrorException if the resolved user is gone', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-5',
          email: 'user@example.com',
          email_verified: true,
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([{ userId: 5 }]))
        .mockReturnValueOnce(selectChain([]));

      await expect(service.googleAuth(googleDto)).rejects.toThrow(
        new InternalServerErrorException(errors.SOMETHING_WENT_WRONG),
      );
    });

    it('throws UnauthorizedException if the account is locked', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-6',
          email: 'user@example.com',
          email_verified: true,
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([{ userId: 6 }]))
        .mockReturnValueOnce(
          selectChain([{ id: 6, lockedUntil: futureDate() }]),
        );

      await expect(service.googleAuth(googleDto)).rejects.toThrow(
        new UnauthorizedException(errors.ACCOUNT_LOCKED),
      );
      expect(sessionService.createSession).not.toHaveBeenCalled();
    });
  });
});
