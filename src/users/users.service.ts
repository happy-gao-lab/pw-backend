import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import DB from '../db/index.js';
import { usersTable } from '../db/schemas/users.schema.js';
import { User } from './entities/user.entity.js';
import { UpdateUserDto } from './dto.js';

type PublicUser = Omit<User, 'passwordHash'>;

const publicColumns = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
};

@Injectable()
export class UsersService {
  findAll(): Promise<PublicUser[]> {
    return DB.select(publicColumns).from(usersTable);
  }

  async findOne(id: number): Promise<PublicUser> {
    const [user] = await DB.select(publicColumns)
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async update(id: number, dto: UpdateUserDto): Promise<PublicUser> {
    await this.findOne(id);
    const [user] = await DB.update(usersTable)
      .set(dto)
      .where(eq(usersTable.id, id))
      .returning(publicColumns);
    return user;
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await DB.delete(usersTable).where(eq(usersTable.id, id));
  }
}
