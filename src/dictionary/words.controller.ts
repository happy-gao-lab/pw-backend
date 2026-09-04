import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { DictionaryService } from './dictionary.service.js';

@UseGuards(AuthGuard)
@Controller('words')
export class WordsController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get()
  findSuggestions(@Query('value') value: string) {
    return this.dictionaryService.findWordSuggestions(value);
  }
}
