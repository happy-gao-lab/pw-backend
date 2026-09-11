import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ACCESS_TOKEN_EXPIRES_IN_MS } from '../constants/index.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: ACCESS_TOKEN_EXPIRES_IN_MS / 1000 },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SessionService, TokenService],
  exports: [AuthGuard, SessionService],
})
export class AuthModule {}
