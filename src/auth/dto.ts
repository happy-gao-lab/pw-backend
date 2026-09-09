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

export class AccessTokenData {
  id: number;
  email: string;
  tokenVersion: number;
}
