import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBlob: vi.fn(),
  getCachedMedia: vi.fn(),
  putCachedMedia: vi.fn()
}));

vi.mock('./api.js', () => ({ api: { getBlob: mocks.getBlob } }));
vi.mock('./offline-db.js', () => ({
  offlineDb: {
    mediaCache: {
      get: mocks.getCachedMedia,
      put: mocks.putCachedMedia
    }
  }
}));

import { loadMediaBlob, mediaCacheKey, mediaQueryKey } from './media-cache.js';

describe('media cache', () => {
  beforeEach(() => vi.clearAllMocks());

  it('separates media query and storage keys by account', () => {
    expect(mediaCacheKey('user-a', 'media-1')).not.toBe(mediaCacheKey('user-b', 'media-1'));
    expect(mediaQueryKey('user-a', 'media-1')).toEqual(['media', 'user-a', 'media-1']);
  });

  it('uses the account cache before requesting media from the API', async () => {
    const blob = new Blob(['cached'], { type: 'audio/mpeg' });
    mocks.getCachedMedia.mockResolvedValue({ blob });

    await expect(loadMediaBlob('user-a', 'media-1')).resolves.toBe(blob);

    expect(mocks.getBlob).not.toHaveBeenCalled();
    expect(mocks.putCachedMedia).not.toHaveBeenCalled();
  });

  it('stores a downloaded media blob under the current account', async () => {
    const blob = new Blob(['downloaded'], { type: 'audio/mpeg' });
    mocks.getCachedMedia.mockResolvedValue(undefined);
    mocks.getBlob.mockResolvedValue(blob);

    await expect(loadMediaBlob('user-a', 'media-1')).resolves.toBe(blob);

    expect(mocks.getBlob).toHaveBeenCalledWith('/media/media-1');
    expect(mocks.putCachedMedia).toHaveBeenCalledWith({
      id: 'user-a:media-1',
      userId: 'user-a',
      mediaId: 'media-1',
      blob,
      cachedAtUtc: expect.any(String)
    });
  });

  it('still returns online audio when the browser cache is full', async () => {
    const blob = new Blob(['downloaded'], { type: 'audio/mpeg' });
    mocks.getCachedMedia.mockResolvedValue(undefined);
    mocks.getBlob.mockResolvedValue(blob);
    mocks.putCachedMedia.mockRejectedValue(new Error('Quota exceeded'));

    await expect(loadMediaBlob('user-a', 'media-1')).resolves.toBe(blob);
  });
});
