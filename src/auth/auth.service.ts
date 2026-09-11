import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { and, eq, sql } from 'drizzle-orm';
import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { Logger } from 'nestjs-pino';

import { errors } from '../constants/errors.js';
import { authThrottler, BCRYPT_SALT_ROUNDS } from '../constants/index.js';
import DB from '../db/index.js';
import { authIdentitiesTable } from '../db/schemas/auth.schemas.js';
import { UsersTable, usersTable } from '../db/schemas/user.schemas.js';
import {
  GoogleSignInDto,
  RefreshTokenDto,
  SignInDto,
  SignUpDto,
} from './dto.js';
import { SessionService } from './session.service.js';

@Injectable()
export class AuthService {
  private googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(
    private readonly sessionService: SessionService,
    private readonly logger: Logger,
  ) {}

  // Detects a Postgres unique constraint violation (SQLSTATE 23505).
  // Two concurrent sign-ups can both pass the email existence check,
  // so the second insert is rejected by the unique index instead.
  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  private async registerFailedAttempt(user: UsersTable): Promise<void> {
    const lockUntil = new Date(
      Date.now() + authThrottler.LOCKOUT_DURATION_MS,
    ).toISOString();

    const [updated] = await DB.update(usersTable)
      .set({
        failedLoginAttempts: sql`${usersTable.failedLoginAttempts} + 1`,
        lockedUntil: sql`CASE WHEN ${usersTable.failedLoginAttempts} + 1 >= ${authThrottler.LIMIT}
        THEN ${lockUntil}
        ELSE ${usersTable.lockedUntil} END`,
      })
      .where(eq(usersTable.id, user.id))
      .returning({ failedLoginAttempts: usersTable.failedLoginAttempts });

    if (!updated) {
      this.logger.error(
        { userId: user.id },
        'Failed login attempt update returned no row',
      );

      return;
    }

    this.logger.warn(
      { userId: user.id, attempts: updated.failedLoginAttempts },
      'Sign-in attempt with invalid password',
    );
  }

  private async resetFailedAttempts(userId: number): Promise<void> {
    await DB.update(usersTable)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(usersTable.id, userId));
  }

  private async registerUser(
    data: { username: string; email: string; password?: string },
    provider: 'local' | 'google',
    providerUserId?: string,
  ) {
    const passwordHash = data.password
      ? await hash(data.password, BCRYPT_SALT_ROUNDS)
      : null;

    // transaction allows to avoid an orphan user if auth identity isn't created
    const user = await DB.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(usersTable)
        .values({ username: data.username, email: data.email })
        .returning();

      if (!newUser) {
        this.logger.error({ email: data.email }, 'User insert returned no row');
        throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
      }

      const [newIdentity] = await tx
        .insert(authIdentitiesTable)
        .values({ userId: newUser.id, provider, passwordHash, providerUserId })
        .returning();

      if (!newIdentity) {
        this.logger.error(
          { userId: newUser.id },
          'Auth identity insert returned no row',
        );
        throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
      }

      return newUser;
    });

    return user;
  }

  private async connectGoogleAccount(
    email: string,
    sub: string,
    username: string,
  ): Promise<number> {
    const [existingUser] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existingUser) {
      await DB.insert(authIdentitiesTable)
        .values({
          userId: existingUser.id,
          provider: 'google',
          providerUserId: sub,
        })
        .onConflictDoNothing();

      return existingUser.id;
    }

    try {
      const newUser = await this.registerUser(
        { username, email },
        'google',
        sub,
      );

      return newUser.id;
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      // a concurrent request has already registered this account
      const [registeredUser] = await DB.select()
        .from(usersTable)
        .where(eq(usersTable.email, email));

      if (!registeredUser) {
        this.logger.error(
          { email },
          'Google account registration conflicted, but no user was found',
        );
        throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
      }

      return registeredUser.id;
    }
  }

  async localSignUp(dto: SignUpDto) {
    const [existingUser] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.email, dto.email));

    if (existingUser) {
      this.logger.warn(
        { email: dto.email },
        'Sign-up attempt with an email already in use',
      );
      throw new ConflictException(errors.EMAIL_IN_USE);
    }

    let newUser: UsersTable;

    try {
      newUser = await this.registerUser(dto, 'local');
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(errors.EMAIL_IN_USE);
      }

      throw error;
    }

    const tokens = await this.sessionService.createSession(newUser.id);

    return tokens;
  }

  async localSignIn(dto: SignInDto) {
    const [user] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.email, dto.email));

    if (!user) {
      this.logger.warn(
        { email: dto.email },
        'Sign-in attempt for unknown email',
      );
      throw new UnauthorizedException(errors.INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new UnauthorizedException(errors.ACCOUNT_LOCKED);
    }

    // the lock has expired, so the attempts budget starts over
    if (user.lockedUntil) {
      await this.resetFailedAttempts(user.id);
    }

    const [userAuthIdentity] = await DB.select()
      .from(authIdentitiesTable)
      .where(
        and(
          eq(authIdentitiesTable.userId, user.id),
          eq(authIdentitiesTable.provider, 'local'),
        ),
      );

    if (!userAuthIdentity || !userAuthIdentity.passwordHash) {
      this.logger.warn(
        { userId: user.id },
        'Sign-in attempt without local identity',
      );
      throw new UnauthorizedException(errors.INVALID_CREDENTIALS);
    }

    const isPasswordValid = await compare(
      dto.password,
      userAuthIdentity.passwordHash,
    );

    if (!isPasswordValid) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException(errors.INVALID_CREDENTIALS);
    }

    await this.resetFailedAttempts(user.id);

    const tokens = await this.sessionService.createSession(user.id);

    return tokens;
  }

  async logout(sessionId: number): Promise<void> {
    await this.sessionService.revokeSession(sessionId);
  }

  async googleAuth(dto: GoogleSignInDto) {
    let ticket: LoginTicket;

    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException(errors.INVALID_TOKEN);
    }

    const email = payload.email;
    const sub = payload.sub;
    const username = payload.name ?? email;

    const [existingIdentity] = await DB.select()
      .from(authIdentitiesTable)
      .where(
        and(
          eq(authIdentitiesTable.provider, 'google'),
          eq(authIdentitiesTable.providerUserId, sub),
        ),
      );

    let userId: number;

    if (existingIdentity) {
      userId = existingIdentity.userId;
    } else {
      // email identifies the account here, so it has to be verified by Google
      if (!payload.email_verified) {
        throw new UnauthorizedException(errors.EMAIL_NOT_VERIFIED);
      }

      userId = await this.connectGoogleAccount(email, sub, username);
    }

    const [user] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) {
      this.logger.error(
        { userId },
        'User not found after google auth resolution',
      );
      throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new UnauthorizedException(errors.ACCOUNT_LOCKED);
    }

    await this.resetFailedAttempts(user.id);

    const tokens = await this.sessionService.createSession(user.id);

    return tokens;
  }

  async refresh(dto: RefreshTokenDto) {
    const tokens = await this.sessionService.refreshSession(dto.refreshToken);

    return tokens;
  }
}
