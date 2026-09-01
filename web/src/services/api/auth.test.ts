import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeHajimiTicket, getSession, login, logout, register } from "@/services/api/auth";

const user = {
    id: "user-1",
    email: "user@example.com",
    name: "测试用户",
    avatarUrl: null,
    provider: "local",
};

function response(body: unknown, status = 200) {
    return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: status === 204 ? undefined : { "Content-Type": "application/json" },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("auth API", () => {
    it("restores a session with credentials included", async () => {
        const fetchMock = vi.fn().mockResolvedValue(response({ data: user }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(getSession()).resolves.toEqual(user);
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ credentials: "include" }));
    });

    it("maps an unauthenticated session response to null", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "unauthorized" }, 401)));

        await expect(getSession()).resolves.toBeNull();
    });

    it.each([
        ["register", () => register({ email: "user@example.com", password: "strong-password", name: "测试用户" }), "/api/auth/register", { email: "user@example.com", password: "strong-password", name: "测试用户" }],
        ["login", () => login({ email: "user@example.com", password: "strong-password" }), "/api/auth/login", { email: "user@example.com", password: "strong-password" }],
        ["Hajimi exchange", () => exchangeHajimiTicket("one-time-ticket"), "/api/auth/hajimi/exchange", { ticket: "one-time-ticket" }],
    ])("posts %s data as JSON without exposing credentials in the URL", async (_name, request, path, body) => {
        const fetchMock = vi.fn().mockResolvedValue(response({ data: user }));
        vi.stubGlobal("fetch", fetchMock);

        await request();
        expect(fetchMock).toHaveBeenCalledWith(
            path,
            expect.objectContaining({
                method: "POST",
                credentials: "include",
                headers: expect.objectContaining({ "Content-Type": "application/json" }),
                body: JSON.stringify(body),
            }),
        );
        expect(path).not.toContain("one-time-ticket");
        expect(path).not.toContain("strong-password");
    });

    it("preserves a password error status and server message", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" } }, 401)));

        await expect(login({ email: "user@example.com", password: "wrong-password" })).rejects.toMatchObject({
            name: "AuthApiError",
            status: 401,
            message: "邮箱或密码错误",
        });
    });

    it("logs out without trying to parse a 204 response", async () => {
        const fetchMock = vi.fn().mockResolvedValue(response(null, 204));
        vi.stubGlobal("fetch", fetchMock);

        await expect(logout()).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST", credentials: "include" }));
    });
});
