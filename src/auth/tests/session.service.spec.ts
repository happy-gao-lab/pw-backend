import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errors } from '../../constants/errors.js';
import { SessionService } from '../session.service.js';
import { TokenService } from '../token.service.js';

const { randomUUID } = vi.hoisted(() => ({ randomUUID: vi.fn() }));

vi.mock('node:crypto', () => ({ randomUUID }));

const mockDB = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
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

function deleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

function futureDate() {
  return new Date(Date.now() + 60_000).toISOString();
}

function pastDate() {
  return new Date(Date.now() - 60_000).toISOString();
}

describe('SessionService', () => {
  let tokenService: {
    signTokens: ReturnType<typeof vi.fn>;
    verifyAccessToken: ReturnType<typeof vi.fn>;
    verifyRefreshToken: ReturnType<typeof vi.fn>;
  };
  let logger: {
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let service: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    randomUUID.mockReturnValue('generated-token-id');
    tokenService = {
      signTokens: vi.fn().mockResolvedValue(tokens),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn(),
    };
    logger = { warn: vi.fn(), error: vi.fn() };
    service = new SessionService(
      tokenService as unknown as TokenService,
      logger as unknown as Logger,
    );
  });

  describe('createSession', () => {
    it('throws InternalServerErrorException if the session insert returns no row', async () => {
      mockDB.delete.mockReturnValue(deleteChain());
      mockDB.insert.mockReturnValue(insertChain([]));

      await expect(service.createSession(1)).rejects.toThrow(
        new InternalServerErrorException(errors.SOMETHING_WENT_WRONG),
      );
    });

    it('clears dead sessions, stores the new one and signs a token pair', async () => {
      mockDB.delete.mockReturnValue(deleteChain());
      mockDB.insert.mockReturnValue(insertChain([{ id: 10 }]));

      const result = await service.createSession(1);

      expect(result).toEqual(tokens);
      expect(mockDB.delete).toHaveBeenCalledTimes(1);
      expect(tokenService.signTokens).toHaveBeenCalledWith(
        10,
        'generated-token-id',
      );
    });
  });

  describe('revokeSession', () => {
    it('marks the session as revoked with a single UPDATE', async () => {
      mockDB.update.mockReturnValue(updateChain());

      await service.revokeSession(10);

      expect(mockDB.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshSession', () => {
    beforeEach(() => {
      tokenService.verifyRefreshToken.mockResolvedValue({
        sessionId: 10,
        tokenId: 'current-token-id',
        type: 'refresh',
      });
    });

    it('throws UnauthorizedException if the session does not exist', async () => {
      mockDB.select.mockReturnValue(selectChain([]));

      await expect(service.refreshSession('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('throws UnauthorizedException if the session is revoked', async () => {
      mockDB.select.mockReturnValue(
        selectChain([
          {
            id: 10,
            userId: 1,
            tokenId: 'current-token-id',
            expiresAt: futureDate(),
            revokedAt: pastDate(),
          },
        ]),
      );

      await expect(service.refreshSession('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('throws UnauthorizedException if the session has expired', async () => {
      mockDB.select.mockReturnValue(
        selectChain([
          {
            id: 10,
            userId: 1,
            tokenId: 'current-token-id',
            expiresAt: pastDate(),
            revokedAt: null,
          },
        ]),
      );

      await expect(service.refreshSession('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('revokes the session if a token that is no longer current is used', async () => {
      mockDB.select.mockReturnValue(
        selectChain([
          {
            id: 10,
            userId: 1,
            tokenId: 'rotated-token-id',
            expiresAt: futureDate(),
            revokedAt: null,
          },
        ]),
      );
      mockDB.update.mockReturnValue(updateChain());

      await expect(service.refreshSession('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { sessionId: 10, userId: 1 },
        'Refresh token reuse detected, revoking the session',
      );
      expect(mockDB.update).toHaveBeenCalledTimes(1);
      expect(tokenService.signTokens).not.toHaveBeenCalled();
    });

    it('keeps the session alive if a concurrent request rotated it first', async () => {
      mockDB.select.mockReturnValue(
        selectChain([
          {
            id: 10,
            userId: 1,
            tokenId: 'current-token-id',
            expiresAt: futureDate(),
            revokedAt: null,
          },
        ]),
      );
      mockDB.update.mockReturnValue(updateReturningChain([]));

      await expect(service.refreshSession('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { sessionId: 10, userId: 1 },
        'Concurrent refresh detected, the token has already been rotated',
      );
      expect(tokenService.signTokens).not.toHaveBeenCalled();
    });

    it('rotates the token id and returns a new pair', async () => {
      mockDB.select.mockReturnValue(
        selectChain([
          {
            id: 10,
            userId: 1,
            tokenId: 'current-token-id',
            expiresAt: futureDate(),
            revokedAt: null,
          },
        ]),
      );
      mockDB.update.mockReturnValue(updateReturningChain([{ id: 10 }]));

      const result = await service.refreshSession('token');

      expect(result).toEqual(tokens);
      expect(tokenService.signTokens).toHaveBeenCalledWith(
        10,
        'generated-token-id',
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('verifyAccess', () => {
    beforeEach(() => {
      tokenService.verifyAccessToken.mockResolvedValue({
        sessionId: 10,
        type: 'access',
      });
    });

    it('throws UnauthorizedException if the session does not exist', async () => {
      mockDB.select.mockReturnValue(selectChain([]));

      await expect(service.verifyAccess('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('throws UnauthorizedException if the session is revoked', async () => {
      mockDB.select.mockReturnValue(
        selectChain([
          { userId: 1, expiresAt: futureDate(), revokedAt: pastDate() },
        ]),
      );

      await expect(service.verifyAccess('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('throws UnauthorizedException if the session has expired', async () => {
      mockDB.select.mockReturnValue(
        selectChain([{ userId: 1, expiresAt: pastDate(), revokedAt: null }]),
      );

      await expect(service.verifyAccess('token')).rejects.toThrow(
        new UnauthorizedException(errors.INVALID_TOKEN),
      );
    });

    it('returns the user and session ids for a live session', async () => {
      mockDB.select.mockReturnValue(
        selectChain([{ userId: 1, expiresAt: futureDate(), revokedAt: null }]),
      );

      const result = await service.verifyAccess('token');

      expect(result).toEqual({ userId: 1, sessionId: 10 });
    });
  });
});
