import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";

vi.mock("@/services/api/auth", () => ({
    getSession: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    exchangeHajimiTicket: vi.fn(),
}));

const mockedAuthApi = vi.mocked(authApi);
const user = {
    id: "user-1",
    email: "user@example.com",
    name: "测试用户",
    avatarUrl: null,
    provider: "local",
};

beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ user: null, status: "idle" });
});

describe("useUserStore", () => {
    it("restores an authenticated session", async () => {
        mockedAuthApi.getSession.mockResolvedValue(user);

        await expect(useUserStore.getState().restoreSession()).resolves.toEqual(user);
        expect(useUserStore.getState()).toMatchObject({ user, status: "authenticated" });
    });

    it("restores an anonymous session", async () => {
        mockedAuthApi.getSession.mockResolvedValue(null);

        await expect(useUserStore.getState().restoreSession()).resolves.toBeNull();
        expect(useUserStore.getState()).toMatchObject({ user: null, status: "anonymous" });
    });

    it("deduplicates concurrent session restoration", async () => {
        let resolveSession: (value: typeof user) => void = () => undefined;
        mockedAuthApi.getSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));

        const first = useUserStore.getState().restoreSession();
        const second = useUserStore.getState().restoreSession();
        resolveSession(user);

        await expect(Promise.all([first, second])).resolves.toEqual([user, user]);
        expect(mockedAuthApi.getSession).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["login", () => useUserStore.getState().login({ email: user.email, password: "strong-password" }), mockedAuthApi.login],
        ["register", () => useUserStore.getState().register({ email: user.email, password: "strong-password", name: user.name || undefined }), mockedAuthApi.register],
    ])("establishes the local session after %s", async (_name, action, endpoint) => {
        endpoint.mockResolvedValue(user);

        await expect(action()).resolves.toEqual(user);
        expect(mockedAuthApi.getSession).not.toHaveBeenCalled();
        expect(useUserStore.getState()).toMatchObject({ user, status: "authenticated" });
    });

    it("deduplicates the same Hajimi ticket exchange", async () => {
        let finishExchange: () => void = () => undefined;
        mockedAuthApi.exchangeHajimiTicket.mockReturnValue(new Promise<typeof user>((resolve) => (finishExchange = () => resolve(user))));

        const first = useUserStore.getState().exchangeHajimi("one-time-ticket");
        const second = useUserStore.getState().exchangeHajimi("one-time-ticket");
        finishExchange();

        await expect(Promise.all([first, second])).resolves.toEqual([user, user]);
        expect(mockedAuthApi.exchangeHajimiTicket).toHaveBeenCalledTimes(1);
    });

    it("clears the local user after server logout", async () => {
        useUserStore.setState({ user, status: "authenticated" });
        mockedAuthApi.logout.mockResolvedValue(undefined);

        await useUserStore.getState().logout();
        expect(useUserStore.getState()).toMatchObject({ user: null, status: "anonymous" });
    });
});
