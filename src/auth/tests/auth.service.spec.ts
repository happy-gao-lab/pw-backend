import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errors } from '../../constants/errors.js';
import { AuthService } from '../auth.service.js';
import { SignInDto, SignUpDto } from '../dto.js';

const { hash, compare } = vi.hoisted(() => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('bcrypt', () => ({ hash, compare }));

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

const signUpDto: SignUpDto = {
  username: 'newbie',
  email: 'newbie@example.com',
  password: 'password123',
};

const signInDto: SignInDto = {
  email: 'newbie@example.com',
  password: 'password123',
};

describe('AuthService', () => {
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    jwtService = { signAsync: vi.fn() };
    service = new AuthService(jwtService as unknown as JwtService);
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

    it('throws UnauthorizedException if there is no local identity', async () => {
      mockDB.select
        .mockReturnValueOnce(selectChain([{ id: 1, tokenVersion: 0 }]))
        .mockReturnValueOnce(selectChain([]));

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_CREDENTIALS),
      );
    });

    it('throws UnauthorizedException if the password is invalid', async () => {
      mockDB.select
        .mockReturnValueOnce(selectChain([{ id: 1, tokenVersion: 0 }]))
        .mockReturnValueOnce(selectChain([{ passwordHash: 'hashed' }]));
      compare.mockResolvedValue(false);

      await expect(service.localSignIn(signInDto)).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_CREDENTIALS),
      );
    });

    it('returns an access token on valid credentials', async () => {
      const user = { id: 1, email: signInDto.email, tokenVersion: 0 };
      mockDB.select
        .mockReturnValueOnce(selectChain([user]))
        .mockReturnValueOnce(selectChain([{ passwordHash: 'hashed' }]));
      compare.mockResolvedValue(true);
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
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where });
      mockDB.update.mockReturnValue({ set });

      await service.logout(1);

      expect(mockDB.select).not.toHaveBeenCalled();
      expect(mockDB.update).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);
      expect(where).toHaveBeenCalledTimes(1);
    });
  });
});
