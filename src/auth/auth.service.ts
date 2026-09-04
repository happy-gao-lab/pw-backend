import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import DB from '../db/index.js';
import { usersTable } from '../db/schemas/users.schema.js';
import { SignInDto, SignUpDto } from './dto.js';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async signUp(dto: SignUpDto) {
    const [existing] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.email, dto.email));
    if (existing) {
      throw new ConflictException('Email is already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const [user] = await DB.insert(usersTable)
      .values({ name: dto.name, email: dto.email, passwordHash })
      .returning();

    return { id: user.id, name: user.name, email: user.email };
  }

  async signIn(dto: SignInDto) {
    const [user] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.email, dto.email));
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return { accessToken };
  }
}
