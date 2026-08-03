import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from './api.js';

afterEach(() => {
  api.setAccessToken(null);
  vi.restoreAllMocks();
});

describe('ApiClient authentication', () => {
  it('refreshes an expired access token and retries the original request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Invalid or expired access token.' }), {
          status: 401
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'refreshed-token' }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-id' }), { status: 200 }));
    api.setAccessToken('expired-token');

    await expect(api.get<{ id: string }>('/decks')).resolves.toEqual({ id: 'user-id' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:3000/api/auth/refresh');
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer refreshed-token' }
    });
  });

  it('does not replace a login error with an access-token refresh request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'Invalid email or password.' }), { status: 401 })
      );
    api.setAccessToken('stale-token');

    await expect(api.post('/auth/login', {})).rejects.toEqual(
      new ApiError(401, 'Invalid email or password.')
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
