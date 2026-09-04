import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';

const { mockSelect, mockFrom, mockWhere, mockInsert, mockValues, mockReturning } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockFrom: vi.fn(),
    mockWhere: vi.fn(),
    mockInsert: vi.fn(),
    mockValues: vi.fn(),
    mockReturning: vi.fn(),
  }));

vi.mock('../db/index.js', () => ({
  default: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });

    jwtService = { signAsync: vi.fn() };
    authService = new AuthService(jwtService as any);
  });

  describe('signUp', () => {
    it('creates a user with a hashed password and returns it without passwordHash', async () => {
      mockWhere.mockResolvedValueOnce([]);
      vi.mocked(bcrypt.hash).mockResolvedValueOnce('hashed-password' as never);
      mockReturning.mockResolvedValueOnce([
        { id: 1, name: 'User One', email: 'user@mail.com', passwordHash: 'hashed-password' },
      ]);

      const result = await authService.signUp({
        name: 'User One',
        email: 'user@mail.com',
        password: 'plain-password',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('plain-password', 10);
      expect(mockValues).toHaveBeenCalledWith({
        name: 'User One',
        email: 'user@mail.com',
        passwordHash: 'hashed-password',
      });
      expect(result).toEqual({ id: 1, name: 'User One', email: 'user@mail.com' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when the email is already in use', async () => {
      mockWhere.mockResolvedValueOnce([
        { id: 1, name: 'Existing', email: 'user@mail.com', passwordHash: 'hash' },
      ]);

      await expect(
        authService.signUp({
          name: 'User One',
          email: 'user@mail.com',
          password: 'plain-password',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('signIn', () => {
    it('returns an access token for valid credentials', async () => {
      mockWhere.mockResolvedValueOnce([
        { id: 1, name: 'User One', email: 'user@mail.com', passwordHash: 'hashed-password' },
      ]);
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
      jwtService.signAsync.mockResolvedValueOnce('signed-jwt');

      const result = await authService.signIn({
        email: 'user@mail.com',
        password: 'plain-password',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('plain-password', 'hashed-password');
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 1,
        email: 'user@mail.com',
      });
      expect(result).toEqual({ accessToken: 'signed-jwt' });
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(
        authService.signIn({ email: 'unknown@mail.com', password: 'plain-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password is invalid', async () => {
      mockWhere.mockResolvedValueOnce([
        { id: 1, name: 'User One', email: 'user@mail.com', passwordHash: 'hashed-password' },
      ]);
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

      await expect(
        authService.signIn({ email: 'user@mail.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});
