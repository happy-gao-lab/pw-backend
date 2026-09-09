import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from '../auth.controller.js';
import { AuthenticatedRequest } from '../auth.guard.js';
import { AuthService } from '../auth.service.js';
import { SignInDto, SignUpDto } from '../dto.js';

describe('AuthController', () => {
  let authService: {
    localSignUp: ReturnType<typeof vi.fn>;
    localSignIn: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      localSignUp: vi.fn(),
      localSignIn: vi.fn(),
      logout: vi.fn(),
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

  it('delegates logout to authService.logout with the authenticated user id', () => {
    const req = {
      user: { id: 42, email: 'newbie@example.com' },
    } as AuthenticatedRequest;

    controller.logout(req);

    expect(authService.logout).toHaveBeenCalledWith(42);
  });
});
