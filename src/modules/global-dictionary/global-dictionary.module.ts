import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { GlobalDictionaryService } from './global-dictionary.service.js';

@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [GlobalDictionaryService],
  exports: [GlobalDictionaryService],
})
export class GlobalDictionaryModule {}
