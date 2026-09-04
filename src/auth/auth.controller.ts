import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SignInDto, SignUpDto } from './dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('signin')
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }
}
