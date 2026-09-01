export type AuthUser = {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    provider: string;
};

type ApiResponse<T> = {
    data: T;
};

type ErrorResponse = {
    error?: {
        code?: string;
        message?: string;
    };
};

export class AuthApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "AuthApiError";
    }
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/auth${path}`, {
        ...init,
        credentials: "include",
        headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    });

    if (!response.ok) {
        let detail: ErrorResponse | null = null;
        try {
            detail = (await response.json()) as ErrorResponse;
        } catch {
            // The status code still provides a stable fallback when the server has no JSON body.
        }
        throw new AuthApiError(detail?.error?.message || `请求失败（HTTP ${response.status}）`, response.status);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
}

export async function getSession() {
    try {
        return (await authRequest<ApiResponse<AuthUser>>("/session")).data;
    } catch (error) {
        if (error instanceof AuthApiError && error.status === 401) return null;
        throw error;
    }
}

export function register(payload: { email: string; password: string; name?: string }) {
    return authRequest<ApiResponse<AuthUser>>("/register", { method: "POST", body: JSON.stringify(payload) }).then((response) => response.data);
}

export function login(payload: { email: string; password: string }) {
    return authRequest<ApiResponse<AuthUser>>("/login", { method: "POST", body: JSON.stringify(payload) }).then((response) => response.data);
}

export function logout() {
    return authRequest<void>("/logout", { method: "POST" });
}

export function exchangeHajimiTicket(ticket: string) {
    return authRequest<ApiResponse<AuthUser>>("/hajimi/exchange", { method: "POST", body: JSON.stringify({ ticket }) }).then((response) => response.data);
}
