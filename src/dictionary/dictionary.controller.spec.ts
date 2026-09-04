import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

import { DictionaryController } from './dictionary.controller.js';
import type { DictionaryService } from './dictionary.service.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';

function makeRequest(userId: number): AuthenticatedRequest {
  return { user: { id: userId, email: 'user@example.com' } } as AuthenticatedRequest;
}

describe('DictionaryController', () => {
  let service: {
    create: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let controller: DictionaryController;

  beforeEach(() => {
    service = {
      create: vi.fn(),
      findAll: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    controller = new DictionaryController(service as unknown as DictionaryService);
  });

  it('create delegates to the service with the authenticated user id', async () => {
    const dto = { value: 'apple', definitions: ['fruit'], translations: ['яблуко'] };
    service.create.mockResolvedValue({ wordId: 1 });

    const result = await controller.create(makeRequest(42), dto);

    expect(service.create).toHaveBeenCalledWith(42, dto);
    expect(result).toEqual({ wordId: 1 });
  });

  it('findAll parses query params and delegates to the service', async () => {
    service.findAll.mockResolvedValue({ data: [], total: 0, pages: 0, page: 1 });

    const result = await controller.findAll(makeRequest(42), '2', '10', 'apple', '1,2,3');

    expect(service.findAll).toHaveBeenCalledWith(42, {
      page: 2,
      pageSize: 10,
      search: 'apple',
      ids: [1, 2, 3],
    });
    expect(result).toEqual({ data: [], total: 0, pages: 0, page: 1 });
  });

  it('findAll passes undefined for omitted query params', async () => {
    service.findAll.mockResolvedValue({ data: [], total: 0, pages: 0, page: 1 });

    await controller.findAll(makeRequest(42), undefined, undefined, undefined, undefined);

    expect(service.findAll).toHaveBeenCalledWith(42, {
      page: undefined,
      pageSize: undefined,
      search: undefined,
      ids: undefined,
    });
  });

  it('update delegates to the service with wordId, userId and dto', async () => {
    const dto = { definitions: ['fruit'], translations: ['яблуко'] };
    service.update.mockResolvedValue(undefined);

    await controller.update(makeRequest(42), 7, dto);

    expect(service.update).toHaveBeenCalledWith(42, 7, dto);
  });

  it('remove delegates to the service with wordId and userId', async () => {
    service.remove.mockResolvedValue(undefined);

    await controller.remove(makeRequest(42), 7);

    expect(service.remove).toHaveBeenCalledWith(42, 7);
  });
});
