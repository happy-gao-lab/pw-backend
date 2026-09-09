import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SignInDto, SignUpDto } from './dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.localSignUp(dto);
  }

  @Post('signin')
  signIn(@Body() dto: SignInDto) {
    return this.authService.localSignIn(dto);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.id);
  }
}
