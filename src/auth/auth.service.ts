import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { and, eq, sql } from 'drizzle-orm';

import { errors } from '../constants/errors.js';
import { BCRYPT_SALT_ROUNDS } from '../constants/index.js';
import DB from '../db/index.js';
import { authIdentitiesTable } from '../db/schemas/auth.schemas.js';
import { usersTable } from '../db/schemas/user.schemas.js';

import { AccessTokenData, SignInDto, SignUpDto } from './dto.js';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  private signAccessToken(data: AccessTokenData) {
    return this.jwtService.signAsync({
      id: data.id,
      email: data.email,
      tokenVersion: data.tokenVersion,
    });
  }

  async localSignUp(dto: SignUpDto) {
    const [existingUser] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.email, dto.email));

    if (existingUser) {
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
        throw new InternalServerErrorException(errors.SOMETHING_WENT_WRONG);
      }

      const [newIdentity] = await tx
        .insert(authIdentitiesTable)
        .values({ userId: newUser.id, provider: 'local', passwordHash })
        .returning();

      if (!newIdentity) {
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
      throw new UnauthorizedException(errors.INVALID_CREDENTIALS);
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
      throw new UnauthorizedException(errors.INVALID_CREDENTIALS);
    }

    const isPasswordValid = await compare(
      dto.password,
      userAuthIdentity.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(errors.INVALID_CREDENTIALS);
    }

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
