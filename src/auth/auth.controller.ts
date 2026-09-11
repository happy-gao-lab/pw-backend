import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { authThrottler } from '../constants/index.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import {
  GoogleSignInDto,
  RefreshTokenDto,
  SignInDto,
  SignUpDto,
} from './dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.localSignUp(dto);
  }

  @Post('signin')
  @Throttle({ default: { ttl: authThrottler.TTL, limit: authThrottler.LIMIT } })
  signIn(@Body() dto: SignInDto) {
    return this.authService.localSignIn(dto);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.sessionId);
  }

  @Post('google')
  googleAuth(@Body() dto: GoogleSignInDto) {
    return this.authService.googleAuth(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }
}
