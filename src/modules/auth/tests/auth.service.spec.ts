import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errors } from '../../../constants/errors.js';
import { AuthService } from '../auth.service.js';
import { GoogleSignInDto, SignInDto, SignUpDto } from '../dto.js';

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

vi.mock('../../../db/index.js', () => ({ default: mockDB }));

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

function insertChainNoReturning() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
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

describe('AuthService', () => {
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    jwtService = { signAsync: vi.fn() };
    logger = { warn: vi.fn(), error: vi.fn() };
    service = new AuthService(
      jwtService as unknown as JwtService,
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
      const newUser = { id: 1, email: signUpDto.email, tokenVersion: 0 };
      const tx = {
        insert: vi
          .fn()
          .mockReturnValueOnce(insertChain([newUser]))
          .mockReturnValueOnce(insertChain([])),
      };
      mockDB.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(tx),
      );

      await expect(service.localSignUp(signUpDto)).rejects.toThrow(
        new InternalServerErrorException(errors.SOMETHING_WENT_WRONG),
      );
    });

    it('creates the user and identity, then returns an access token', async () => {
      mockDB.select.mockReturnValue(selectChain([]));
      hash.mockResolvedValue('hashed-password');
      const newUser = {
        id: 1,
        email: signUpDto.email,
        username: signUpDto.username,
        tokenVersion: 0,
      };
      const tx = {
        insert: vi
          .fn()
          .mockReturnValueOnce(insertChain([newUser]))
          .mockReturnValueOnce(insertChain([{ id: 1 }])),
      };
      mockDB.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(tx),
      );
      jwtService.signAsync.mockResolvedValue('signed-token');

      const result = await service.localSignUp(signUpDto);

      expect(result).toEqual({ accessToken: 'signed-token' });
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        id: newUser.id,
        email: newUser.email,
        tokenVersion: newUser.tokenVersion,
      });
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
      const lockedUntil = new Date(Date.now() + 60_000).toISOString();
      mockDB.select.mockReturnValueOnce(
        selectChain([{ id: 1, tokenVersion: 0, lockedUntil }]),
      );

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.ACCOUNT_LOCKED),
      );
    });

    it('throws UnauthorizedException if there is no local identity', async () => {
      mockDB.select
        .mockReturnValueOnce(
          selectChain([{ id: 1, tokenVersion: 0, lockedUntil: null }]),
        )
        .mockReturnValueOnce(selectChain([]));

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_CREDENTIALS),
      );
    });

    it('throws UnauthorizedException if the password is invalid', async () => {
      mockDB.select
        .mockReturnValueOnce(
          selectChain([{ id: 1, tokenVersion: 0, lockedUntil: null }]),
        )
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
    });

    it('returns an access token on valid credentials', async () => {
      const user = {
        id: 1,
        email: signInDto.email,
        tokenVersion: 0,
        lockedUntil: null,
      };
      mockDB.select
        .mockReturnValueOnce(selectChain([user]))
        .mockReturnValueOnce(selectChain([{ passwordHash: 'hashed' }]));
      compare.mockResolvedValue(true);
      mockDB.update.mockReturnValue(updateChain());
      jwtService.signAsync.mockResolvedValue('signed-token');

      const result = await service.localSignIn(signInDto);

      expect(result).toEqual({ accessToken: 'signed-token' });
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        id: user.id,
        email: user.email,
        tokenVersion: user.tokenVersion,
      });
    });
  });

  describe('logout', () => {
    it('increments tokenVersion atomically via a single UPDATE', async () => {
      mockDB.update.mockReturnValue(updateChain());

      await service.logout(1);

      expect(mockDB.select).not.toHaveBeenCalled();
      expect(mockDB.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('googleAuth', () => {
    it('throws UnauthorizedException if the token payload is missing sub/email', async () => {
      verifyIdToken.mockResolvedValue({ getPayload: () => ({}) });

      await expect(service.googleAuth(googleDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('signs in an existing google identity without touching users table lookups', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'user@example.com',
          name: 'User',
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([{ userId: 1 }])) // existingIdentity
        .mockReturnValueOnce(
          selectChain([{ id: 1, email: 'user@example.com', tokenVersion: 0 }]),
        ); // final user fetch
      jwtService.signAsync.mockResolvedValue('signed-token');

      const result = await service.googleAuth(googleDto);

      expect(result).toEqual({ accessToken: 'signed-token' });
      expect(mockDB.insert).not.toHaveBeenCalled();
      expect(mockDB.transaction).not.toHaveBeenCalled();
    });

    it('links a google identity to an existing local user by email', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-2',
          email: 'user@example.com',
          name: 'User',
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([])) // no existingIdentity
        .mockReturnValueOnce(selectChain([{ id: 2, email: 'user@example.com' }])) // existingUser by email
        .mockReturnValueOnce(
          selectChain([{ id: 2, email: 'user@example.com', tokenVersion: 0 }]),
        ); // final user fetch
      mockDB.insert.mockReturnValue(insertChainNoReturning());
      jwtService.signAsync.mockResolvedValue('signed-token');

      const result = await service.googleAuth(googleDto);

      expect(result).toEqual({ accessToken: 'signed-token' });
      expect(mockDB.insert).toHaveBeenCalledTimes(1);
      expect(mockDB.transaction).not.toHaveBeenCalled();
    });

    it('creates a new user when no identity or email match exists', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-3',
          email: 'brandnew@example.com',
          name: 'Brand New',
        }),
      });
      mockDB.select
        .mockReturnValueOnce(selectChain([])) // no existingIdentity
        .mockReturnValueOnce(selectChain([])) // no existingUser by email
        .mockReturnValueOnce(
          selectChain([
            { id: 3, email: 'brandnew@example.com', tokenVersion: 0 },
          ]),
        ); // final user fetch
      const newUser = {
        id: 3,
        email: 'brandnew@example.com',
        tokenVersion: 0,
      };
      const tx = {
        insert: vi
          .fn()
          .mockReturnValueOnce(insertChain([newUser]))
          .mockReturnValueOnce(insertChain([{ id: 1 }])),
      };
      mockDB.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(tx),
      );
      jwtService.signAsync.mockResolvedValue('signed-token');

      const result = await service.googleAuth(googleDto);

      expect(result).toEqual({ accessToken: 'signed-token' });
      expect(mockDB.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
