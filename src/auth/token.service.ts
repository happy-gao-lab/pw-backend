import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { errors } from '../constants/errors.js';
import { REFRESH_TOKEN_EXPIRES_IN_MS } from '../constants/index.js';
import { AccessTokenPayload, RefreshTokenPayload } from './dto.js';

@Injectable()
export class TokenService {
  private readonly refreshSecret: string;

  constructor(private readonly jwtService: JwtService) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not set');
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not set');
    }

    this.refreshSecret = process.env.JWT_REFRESH_SECRET;
  }

  private signAccessToken(sessionId: number) {
    return this.jwtService.signAsync({ sessionId, type: 'access' });
  }

  private signRefreshToken(sessionId: number, tokenId: string) {
    return this.jwtService.signAsync(
      { sessionId, tokenId, type: 'refresh' },
      {
        secret: this.refreshSecret,
        expiresIn: REFRESH_TOKEN_EXPIRES_IN_MS / 1000,
      },
    );
  }

  async signTokens(sessionId: number, tokenId: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(sessionId),
      this.signRefreshToken(sessionId, tokenId),
    ]);

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    return payload;
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    return payload;
  }
}
