import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { GlobalDictionaryModule } from '../global-dictionary/global-dictionary.module.js';
import { UserDictionaryService } from './user-dictionary.service.js';

@Module({
  imports: [AuthModule, GlobalDictionaryModule],
  controllers: [],
  providers: [UserDictionaryService],
})
export class UserDictionaryModule {}
