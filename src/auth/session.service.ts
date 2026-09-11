import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, isNotNull, lt, or } from 'drizzle-orm';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { errors } from '../constants/errors.js';
import { REFRESH_TOKEN_EXPIRES_IN_MS } from '../constants/index.js';
import DB from '../db/index.js';
import { sessionsTable } from '../db/schemas/session.schemas.js';
import { TokenService } from './token.service.js';

@Injectable()
export class SessionService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly logger: Logger,
  ) {}

  private getExpiresAt(): string {
    return new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_MS).toISOString();
  }

  // revoked and expired sessions are dead weight, so they go on the next sign-in
  private async deleteDeadSessions(userId: number): Promise<void> {
    await DB.delete(sessionsTable).where(
      and(
        eq(sessionsTable.userId, userId),
        or(
          isNotNull(sessionsTable.revokedAt),
          lt(sessionsTable.expiresAt, new Date().toISOString()),
        ),
      ),
    );
  }

  async createSession(userId: number) {
    await this.deleteDeadSessions(userId);

    const tokenId = randomUUID();

    const [session] = await DB.insert(sessionsTable)
      .values({ userId, tokenId, expiresAt: this.getExpiresAt() })
      .returning({ id: sessionsTable.id });

    if (!session) {
      this.logger.error({ userId }, 'Session insert returned no row');
      throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
    }

    const tokens = await this.tokenService.signTokens(session.id, tokenId);

    return tokens;
  }

  async revokeSession(sessionId: number): Promise<void> {
    await DB.update(sessionsTable)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(sessionsTable.id, sessionId));
  }

  async refreshSession(refreshToken: string) {
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);

    const [session] = await DB.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, payload.sessionId));

    if (!session || session.revokedAt) {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    if (new Date(session.expiresAt) <= new Date()) {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    // the token is valid but no longer current, so it has already been used
    if (session.tokenId !== payload.tokenId) {
      this.logger.warn(
        { sessionId: session.id, userId: session.userId },
        'Refresh token reuse detected, revoking the session',
      );
      await this.revokeSession(session.id);
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    const tokenId = randomUUID();

    const rotated = await DB.update(sessionsTable)
      .set({ tokenId, expiresAt: this.getExpiresAt() })
      .where(
        and(
          eq(sessionsTable.id, session.id),
          eq(sessionsTable.tokenId, payload.tokenId),
        ),
      )
      .returning({ id: sessionsTable.id });

    // another request rotated the session first, so this token is already spent
    if (rotated.length === 0) {
      this.logger.warn(
        { sessionId: session.id, userId: session.userId },
        'Concurrent refresh detected, the token has already been rotated',
      );
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    const tokens = await this.tokenService.signTokens(session.id, tokenId);

    return tokens;
  }

  async verifyAccess(token: string) {
    const payload = await this.tokenService.verifyAccessToken(token);

    const [session] = await DB.select({
      userId: sessionsTable.userId,
      expiresAt: sessionsTable.expiresAt,
      revokedAt: sessionsTable.revokedAt,
    })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, payload.sessionId));

    if (!session || session.revokedAt) {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    if (new Date(session.expiresAt) <= new Date()) {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    return { userId: session.userId, sessionId: payload.sessionId };
  }
}
