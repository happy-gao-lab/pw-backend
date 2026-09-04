import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { DictionaryService } from './dictionary.service.js';
import { CreateWordDto, UpdateWordDto } from './dto.js';
import type { DictionaryFilter, DictionarySort } from './dto.js';

@UseGuards(AuthGuard)
@Controller('dictionary')
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateWordDto) {
    return this.dictionaryService.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('ids') ids?: string,
    @Query('sort') sort?: DictionarySort,
    @Query('filter') filter?: DictionaryFilter,
  ) {
    return this.dictionaryService.findAll(req.user.id, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      ids: ids ? ids.split(',').map(Number) : undefined,
      sort,
      filter,
    });
  }

  @Patch(':wordId')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('wordId', ParseIntPipe) wordId: number,
    @Body() dto: UpdateWordDto,
  ) {
    return this.dictionaryService.update(req.user.id, wordId, dto);
  }

  @Delete(':wordId')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('wordId', ParseIntPipe) wordId: number,
  ) {
    return this.dictionaryService.remove(req.user.id, wordId);
  }
}
