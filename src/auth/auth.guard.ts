import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

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
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        email: string;
      }>(token);
      request.user = { id: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }
}
