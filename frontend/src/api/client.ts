export interface ApiError {
  statusCode: number;
  message: string;
  field?: string;
}

export class ApiClientError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

/**
 * Reads the gl_csrf cookie value from document.cookie.
 * Returns undefined if the cookie is absent.
 */
function getCsrfToken(): string | undefined {
  const match = document.cookie.split('; ').find((row) => row.startsWith('gl_csrf='));
  return match ? match.split('=')[1] : undefined;
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return {
      statusCode: res.status,
      message: typeof body.message === 'string' ? body.message : res.statusText,
      field: typeof body.field === 'string' ? body.field : undefined,
    };
  } catch {
    return { statusCode: res.status, message: res.statusText };
  }
}

export class ApiClient {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(path, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) {
      const error = await parseErrorBody(res);
      throw new ApiClientError(error);
    }
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await parseErrorBody(res);
      throw new ApiClientError(error);
    }
    return res.json() as Promise<T>;
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(path, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await parseErrorBody(res);
      throw new ApiClientError(error);
    }
    return res.json() as Promise<T>;
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(path, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await parseErrorBody(res);
      throw new ApiClientError(error);
    }
    return res.json() as Promise<T>;
  }

  async delete<T>(path: string): Promise<T> {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(path, {
      method: 'DELETE',
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      const error = await parseErrorBody(res);
      throw new ApiClientError(error);
    }
    return res.json() as Promise<T>;
  }
}

/** Singleton API client */
export const apiClient = new ApiClient();
