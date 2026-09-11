import { IsEmail, IsString, MinLength } from 'class-validator';

import { MIN_PASSWORD_LENGTH } from '../constants/index.js';

export class SignUpDto {
  @IsString()
  @MinLength(2)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  password: string;
}

export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class GoogleSignInDto {
  @IsString()
  idToken: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export type TokenType = 'access' | 'refresh';

export class AccessTokenPayload {
  sessionId: number;
  type: TokenType;
}

export class RefreshTokenPayload {
  sessionId: number;
  tokenId: string;
  type: TokenType;
}
