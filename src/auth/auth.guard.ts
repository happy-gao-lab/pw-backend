import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { Request } from 'express';

import { errors } from '../constants/errors.js';
import DB from '../db/index.js';
import { usersTable } from '../db/schemas/user.schemas.js';

import { AccessTokenData } from './dto.js';

export interface AuthenticatedRequest extends Request {
  user: { id: number; email: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new UnauthorizedException(errors.MISSING_TOKEN);
    }

    let payload: AccessTokenData;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenData>(token);
    } catch {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    const [user] = await DB.select({ tokenVersion: usersTable.tokenVersion })
      .from(usersTable)
      .where(eq(usersTable.id, payload.id));

    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    request.user = { id: payload.id, email: payload.email };

    return true;
  }
}
