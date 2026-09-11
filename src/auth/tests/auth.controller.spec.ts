import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from '../auth.controller.js';
import { AuthenticatedRequest } from '../auth.guard.js';
import { AuthService } from '../auth.service.js';
import {
  GoogleSignInDto,
  RefreshTokenDto,
  SignInDto,
  SignUpDto,
} from '../dto.js';

describe('AuthController', () => {
  let authService: {
    localSignUp: ReturnType<typeof vi.fn>;
    localSignIn: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    googleAuth: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
  };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      localSignUp: vi.fn(),
      localSignIn: vi.fn(),
      logout: vi.fn(),
      googleAuth: vi.fn(),
      refresh: vi.fn(),
    };
    controller = new AuthController(authService as unknown as AuthService);
  });

  it('delegates signUp to authService.localSignUp', () => {
    const dto: SignUpDto = {
      username: 'newbie',
      email: 'newbie@example.com',
      password: 'password123',
    };

    controller.signUp(dto);

    expect(authService.localSignUp).toHaveBeenCalledWith(dto);
  });

  it('delegates signIn to authService.localSignIn', () => {
    const dto: SignInDto = {
      email: 'newbie@example.com',
      password: 'password123',
    };

    controller.signIn(dto);

    expect(authService.localSignIn).toHaveBeenCalledWith(dto);
  });

  it('delegates logout to authService.logout with the authenticated session id', () => {
    const req = {
      user: { id: 42, sessionId: 10 },
    } as AuthenticatedRequest;

    controller.logout(req);

    expect(authService.logout).toHaveBeenCalledWith(10);
  });

  it('delegates googleAuth to authService.googleAuth', () => {
    const dto: GoogleSignInDto = { idToken: 'google-id-token' };

    controller.googleAuth(dto);

    expect(authService.googleAuth).toHaveBeenCalledWith(dto);
  });

  it('delegates refresh to authService.refresh', () => {
    const dto: RefreshTokenDto = { refreshToken: 'refresh-token' };

    controller.refresh(dto);

    expect(authService.refresh).toHaveBeenCalledWith(dto);
  });
});
