import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { and, eq, sql } from 'drizzle-orm';
import { Logger } from 'nestjs-pino';

import { errors } from '../constants/errors.js';
import { authThrottler, BCRYPT_SALT_ROUNDS } from '../constants/index.js';
import DB from '../db/index.js';
import { authIdentitiesTable } from '../db/schemas/auth.schemas.js';
import { UsersTable, usersTable } from '../db/schemas/user.schemas.js';
import { AccessTokenData, SignInDto, SignUpDto } from './dto.js';

@Injectable()
export class AuthService {
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

    const passwordHash = await hash(dto.password, BCRYPT_SALT_ROUNDS);

    // allows to avoid an orphan user if auth identity isn't created
    const newUser = await DB.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(usersTable)
        .values({ username: dto.username, email: dto.email })
        .returning();

      if (!newUser) {
        this.logger.error({ email: dto.email }, 'User insert returned no row');
        throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
      }

      const [newIdentity] = await tx
        .insert(authIdentitiesTable)
        .values({ userId: newUser.id, provider: 'local', passwordHash })
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
}
