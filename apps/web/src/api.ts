const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
interface ApiErrorResponse {
  message?: string;
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
class ApiClient {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<string | null> | null = null;

  setAccessToken(accessToken: string | null): void {
    this.accessToken = accessToken;
  }
  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }
  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }
  postForm<T>(path: string, body: FormData): Promise<T> {
    return this.request<T>(path, { method: 'POST', body });
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }
  delete(path: string): Promise<void> {
    return this.request<void>(path, { method: 'DELETE' });
  }
  getBlob(path: string): Promise<Blob> {
    return this.requestBlob(path);
  }
  refresh(): Promise<{ accessToken: string; deviceId?: string }> {
    return this.request<{ accessToken: string; deviceId?: string }>(
      '/auth/refresh',
      { method: 'POST' },
      false
    );
  }
  private async request<T>(
    path: string,
    options: RequestInit = {},
    allowRefresh = true
  ): Promise<T> {
    const response = await this.fetch(path, options);
    if (!response.ok) {
      if (
        response.status === 401 &&
        allowRefresh &&
        this.accessToken !== null &&
        this.shouldRefresh(path)
      ) {
        const accessToken = await this.refreshAccessToken();
        if (accessToken !== null) {
          return this.request<T>(path, options, false);
        }
      }

      throw await this.toApiError(response, 'Không thể hoàn tất yêu cầu.');
    }
    return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
  }
  private async requestBlob(path: string, allowRefresh = true): Promise<Blob> {
    const response = await this.fetch(path);
    if (!response.ok) {
      if (
        response.status === 401 &&
        allowRefresh &&
        this.accessToken !== null &&
        this.shouldRefresh(path)
      ) {
        const accessToken = await this.refreshAccessToken();
        if (accessToken !== null) {
          return this.requestBlob(path, false);
        }
      }

      throw await this.toApiError(response, 'Không thể tải media.');
    }
    return response.blob();
  }
  private fetch(path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${apiUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body === undefined || options.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(this.accessToken === null ? {} : { Authorization: `Bearer ${this.accessToken}` }),
        ...options.headers
      }
    });
  }
  private shouldRefresh(path: string): boolean {
    return path !== '/auth/login' && path !== '/auth/register' && path !== '/auth/refresh';
  }
  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshInFlight !== null) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.refresh()
      .then(({ accessToken }) => {
        this.setAccessToken(accessToken);
        return accessToken;
      })
      .catch(() => {
        this.setAccessToken(null);
        return null;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }
  private async toApiError(response: Response, fallbackMessage: string): Promise<ApiError> {
    const error = (await response.json().catch(() => ({}))) as ApiErrorResponse;
    return new ApiError(response.status, error.message ?? fallbackMessage);
  }
}
export const api = new ApiClient();
