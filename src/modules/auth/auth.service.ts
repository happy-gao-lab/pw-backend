import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { and, eq, sql } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { Logger } from 'nestjs-pino';

import { errors } from '../../constants/errors.js';
import { authThrottler, BCRYPT_SALT_ROUNDS } from '../../constants/index.js';
import DB from '../../db/index.js';
import { authIdentitiesTable } from '../../db/schemas/auth.schemas.js';
import { User, usersTable } from '../../db/schemas/user.schemas.js';
import {
  AccessTokenData,
  GoogleSignInDto,
  SignInDto,
  SignUpDto,
} from './dto.js';

@Injectable()
export class AuthService {
  private googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
  ) {}

  private signAccessToken(data: AccessTokenData) {
    return this.jwtService.signAsync({
      id: data.id,
      email: data.email,
      tokenVersion: data.tokenVersion,
    });
  }

  private async registerFailedAttempt(user: User): Promise<void> {
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

    // allows to avoid an orphan user if auth identity isn't created
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

    const newUser = await this.registerUser(dto, 'local');

    const accessToken = await this.signAccessToken({
      id: newUser.id,
      email: newUser.email,
      tokenVersion: newUser.tokenVersion,
    });

    return { accessToken };
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

    const accessToken = await this.signAccessToken({
      id: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });

    return { accessToken };
  }

  async logout(userId: number): Promise<void> {
    await DB.update(usersTable)
      .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1` })
      .where(eq(usersTable.id, userId));
  }

  async googleAuth(dto: GoogleSignInDto) {
    const ticket = await this.googleClient.verifyIdToken({
      idToken: dto.idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

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
      const [existingUser] = await DB.select()
        .from(usersTable)
        .where(eq(usersTable.email, email));

      if (existingUser) {
        await DB.insert(authIdentitiesTable).values({
          userId: existingUser.id,
          provider: 'google',
          providerUserId: sub,
        });

        userId = existingUser.id;
      } else {
        const newUser = await this.registerUser(
          { username, email },
          'google',
          sub,
        );

        userId = newUser.id;
      }
    }

    const [user] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const accessToken = await this.signAccessToken({
      id: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });

    return { accessToken };
  }
}
