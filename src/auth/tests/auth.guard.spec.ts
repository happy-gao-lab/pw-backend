import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errors } from '../../constants/errors.js';
import { AuthenticatedRequest, AuthGuard } from '../auth.guard.js';
import { SessionService } from '../session.service.js';

function createContext(request: Partial<AuthenticatedRequest>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let sessionService: { verifyAccess: ReturnType<typeof vi.fn> };
  let guard: AuthGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionService = { verifyAccess: vi.fn() };
    guard = new AuthGuard(sessionService as unknown as SessionService);
  });

  it('throws UnauthorizedException if the authorization header is missing', async () => {
    const context = createContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(errors.MISSING_TOKEN),
    );
    expect(sessionService.verifyAccess).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException if the header is not a Bearer token', async () => {
    const context = createContext({ headers: { authorization: 'Basic abc' } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(errors.MISSING_TOKEN),
    );
    expect(sessionService.verifyAccess).not.toHaveBeenCalled();
  });

  it('propagates the rejection if the session is not valid', async () => {
    sessionService.verifyAccess.mockRejectedValue(
      new UnauthorizedException(errors.INVALID_TOKEN),
    );
    const context = createContext({
      headers: { authorization: 'Bearer invalid' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(errors.INVALID_TOKEN),
    );
  });

  it('attaches the user and the session to the request and allows access', async () => {
    sessionService.verifyAccess.mockResolvedValue({ userId: 1, sessionId: 10 });
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer valid' },
    };
    const context = createContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 1, sessionId: 10 });
    expect(sessionService.verifyAccess).toHaveBeenCalledWith('valid');
  });
});
