import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { errors } from '../constants/errors.js';
import { SessionService } from './session.service.js';

export interface AuthenticatedRequest extends Request {
  user: { id: number; sessionId: number };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authHeader = request.headers.authorization;

    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new UnauthorizedException(errors.MISSING_TOKEN);
    }

    const { userId, sessionId } = await this.sessionService.verifyAccess(token);

    request.user = { id: userId, sessionId };

    return true;
  }
}
