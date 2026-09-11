import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { errors } from '../../constants/errors.js';
import { REFRESH_TOKEN_EXPIRES_IN_MS } from '../../constants/index.js';
import { TokenService } from '../token.service.js';

describe('TokenService', () => {
  let jwtService: {
    signAsync: ReturnType<typeof vi.fn>;
    verifyAsync: ReturnType<typeof vi.fn>;
  };
  let service: TokenService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('JWT_SECRET', 'access-secret');
    vi.stubEnv('JWT_REFRESH_SECRET', 'refresh-secret');
    jwtService = { signAsync: vi.fn(), verifyAsync: vi.fn() };
    service = new TokenService(jwtService as unknown as JwtService);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    it('throws if JWT_SECRET is not set', () => {
      vi.stubEnv('JWT_SECRET', '');

      expect(
        () => new TokenService(jwtService as unknown as JwtService),
      ).toThrow('JWT_SECRET is not set');
    });

    it('throws if JWT_REFRESH_SECRET is not set', () => {
      vi.stubEnv('JWT_REFRESH_SECRET', '');

      expect(
        () => new TokenService(jwtService as unknown as JwtService),
      ).toThrow('JWT_REFRESH_SECRET is not set');
    });
  });

  describe('signTokens', () => {
    it('signs the access token with the module secret and the refresh token with its own', async () => {
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.signTokens(7, 'token-id');

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sessionId: 7,
        type: 'access',
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sessionId: 7, tokenId: 'token-id', type: 'refresh' },
        {
          secret: 'refresh-secret',
          expiresIn: REFRESH_TOKEN_EXPIRES_IN_MS / 1000,
        },
      );
    });
  });

  describe('verifyAccessToken', () => {
    it('throws UnauthorizedException if verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad signature'));

      await expect(service.verifyAccessToken('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('throws UnauthorizedException if the token is not an access token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sessionId: 7,
        type: 'refresh',
      });

      await expect(service.verifyAccessToken('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('returns the payload of a valid access token', async () => {
      const payload = { sessionId: 7, type: 'access' };
      jwtService.verifyAsync.mockResolvedValue(payload);

      const result = await service.verifyAccessToken('token');

      expect(result).toEqual(payload);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('throws UnauthorizedException if verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad signature'));

      await expect(service.verifyRefreshToken('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('throws UnauthorizedException if the token is not a refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sessionId: 7,
        tokenId: 'token-id',
        type: 'access',
      });

      await expect(service.verifyRefreshToken('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('verifies with the refresh secret and returns the payload', async () => {
      const payload = { sessionId: 7, tokenId: 'token-id', type: 'refresh' };
      jwtService.verifyAsync.mockResolvedValue(payload);

      const result = await service.verifyRefreshToken('token');

      expect(result).toEqual(payload);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('token', {
        secret: 'refresh-secret',
      });
    });
  });
});
