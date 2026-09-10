import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UserDictionaryService } from './user-dictionary.service.js';

@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [UserDictionaryService],
})
export class UserDictionaryModule {}
