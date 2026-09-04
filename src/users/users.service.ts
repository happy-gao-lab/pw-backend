import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import DB from '../db/index.js';
import { usersTable } from '../db/schemas/users.schema.js';
import { User } from './entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  findAll(): Promise<User[]> {
    return DB.select().from(usersTable);
  }

  async findOne(id: number): Promise<User> {
    const [user] = await DB.select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const [user] = await DB.insert(usersTable).values(dto).returning();
    return user;
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    await this.findOne(id);
    const [user] = await DB.update(usersTable)
      .set(dto)
      .where(eq(usersTable.id, id))
      .returning();
    return user;
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await DB.delete(usersTable).where(eq(usersTable.id, id));
  }
}
