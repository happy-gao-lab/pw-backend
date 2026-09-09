import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errors } from '../../constants/errors.js';
import { AuthenticatedRequest, AuthGuard } from '../auth.guard.js';

const mockDB = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('../../db/index.js', () => ({ default: mockDB }));

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createContext(request: Partial<AuthenticatedRequest>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };
  let guard: AuthGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    jwtService = { verifyAsync: vi.fn() };
    guard = new AuthGuard(jwtService as unknown as JwtService);
  });

  it('throws UnauthorizedException if the authorization header is missing', async () => {
    const context = createContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(errors.MISSING_TOKEN),
    );
  });

  it('throws UnauthorizedException if the header is not a Bearer token', async () => {
    const context = createContext({ headers: { authorization: 'Basic abc' } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(errors.MISSING_TOKEN),
    );
  });

  it('throws UnauthorizedException if the token fails verification', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('bad signature'));
    const context = createContext({
      headers: { authorization: 'Bearer invalid' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(errors.INVALID_TOKEN),
    );
  });

  it('throws UnauthorizedException if the user no longer exists', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      id: 1,
      email: 'a@a.com',
      tokenVersion: 0,
    });
    mockDB.select.mockReturnValue(selectChain([]));
    const context = createContext({
      headers: { authorization: 'Bearer valid' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(errors.INVALID_TOKEN),
    );
  });

  it('throws UnauthorizedException if tokenVersion does not match', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      id: 1,
      email: 'a@a.com',
      tokenVersion: 0,
    });
    mockDB.select.mockReturnValue(selectChain([{ tokenVersion: 1 }]));
    const context = createContext({
      headers: { authorization: 'Bearer valid' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(errors.INVALID_TOKEN),
    );
  });

  it('attaches the user to the request and allows access', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      id: 1,
      email: 'a@a.com',
      tokenVersion: 0,
    });
    mockDB.select.mockReturnValue(selectChain([{ tokenVersion: 0 }]));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer valid' },
    };
    const context = createContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 1, email: 'a@a.com' });
  });
});
