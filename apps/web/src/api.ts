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
  setAccessToken(accessToken: string | null): void {
    this.accessToken = accessToken;
  }
  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
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
  refresh(): Promise<{ accessToken: string }> {
    return this.request('/auth/refresh', { method: 'POST' });
  }
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiUrl}${path}`, {
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
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      throw new ApiError(response.status, error.message ?? 'Không thể hoàn tất yêu cầu.');
    }
    return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
  }
  private async requestBlob(path: string): Promise<Blob> {
    const response = await fetch(`${apiUrl}${path}`, {
      credentials: 'include',
      headers: this.accessToken === null ? {} : { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      throw new ApiError(response.status, error.message ?? 'Không thể tải media.');
    }
    return response.blob();
  }
}
export const api = new ApiClient();
