import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DictionaryController } from './dictionary.controller.js';
import { WordsController } from './words.controller.js';
import { DictionaryService } from './dictionary.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DictionaryController, WordsController],
  providers: [DictionaryService],
})
export class DictionaryModule {}
