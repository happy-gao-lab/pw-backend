import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

import { PracticeController } from './practice.controller.js';
import type { PracticeService } from './practice.service.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';

function makeRequest(userId: number): AuthenticatedRequest {
  return { user: { id: userId, email: 'user@example.com' } } as AuthenticatedRequest;
}

describe('PracticeController', () => {
  let service: { getSession: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  let controller: PracticeController;

  beforeEach(() => {
    service = { getSession: vi.fn(), verify: vi.fn() };
    controller = new PracticeController(service as unknown as PracticeService);
  });

  it('getSession delegates to the service with the authenticated user id and filter', async () => {
    const session = [{ wordId: 1, word: 'apple', definitions: ['fruit'], translations: ['яблуко'] }];
    service.getSession.mockResolvedValue(session);

    const result = await controller.getSession(makeRequest(42), 'learned');

    expect(service.getSession).toHaveBeenCalledWith(42, 'learned');
    expect(result).toEqual(session);
  });

  it('getSession works without a filter', async () => {
    service.getSession.mockResolvedValue([]);

    await controller.getSession(makeRequest(42), undefined);

    expect(service.getSession).toHaveBeenCalledWith(42, undefined);
  });

  it('verify delegates to the service with the authenticated user id', async () => {
    const dto = { wordId: 5, type: 'type_word' as const, answer: 'bank' };
    service.verify.mockResolvedValue({ isCorrect: true });

    const result = await controller.verify(makeRequest(42), dto);

    expect(service.verify).toHaveBeenCalledWith(42, dto);
    expect(result).toEqual({ isCorrect: true });
  });
});
