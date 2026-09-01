import { create } from "zustand";

import * as authApi from "@/services/api/auth";
import type { AuthUser } from "@/services/api/auth";

export type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous" | "error";

type UserStore = {
    user: AuthUser | null;
    status: AuthStatus;
    restoreSession: (force?: boolean) => Promise<AuthUser | null>;
    login: (payload: { email: string; password: string }) => Promise<AuthUser>;
    register: (payload: { email: string; password: string; name?: string }) => Promise<AuthUser>;
    exchangeHajimi: (ticket: string) => Promise<AuthUser>;
    logout: () => Promise<void>;
    clearSession: () => void;
};

let restoreRequest: Promise<AuthUser | null> | null = null;
const exchangeRequests = new Map<string, Promise<AuthUser>>();

export const useUserStore = create<UserStore>()((set, get) => ({
    user: null,
    status: "idle",
    restoreSession: async (force = false) => {
        const current = get();
        if (!force && current.status === "authenticated") return current.user;
        if (!force && current.status === "anonymous") return null;
        if (restoreRequest) return restoreRequest;

        set({ status: "loading" });
        restoreRequest = authApi
            .getSession()
            .then((user) => {
                set({ user, status: user ? "authenticated" : "anonymous" });
                return user;
            })
            .catch((error) => {
                set({ user: null, status: "error" });
                throw error;
            })
            .finally(() => {
                restoreRequest = null;
            });
        return restoreRequest;
    },
    login: async (payload) => {
        const user = await authApi.login(payload);
        set({ user, status: "authenticated" });
        return user;
    },
    register: async (payload) => {
        const user = await authApi.register(payload);
        set({ user, status: "authenticated" });
        return user;
    },
    exchangeHajimi: (ticket) => {
        const existing = exchangeRequests.get(ticket);
        if (existing) return existing;

        const request = authApi
            .exchangeHajimiTicket(ticket)
            .then((user) => {
                set({ user, status: "authenticated" });
                return user;
            })
            .finally(() => exchangeRequests.delete(ticket));
        exchangeRequests.set(ticket, request);
        return request;
    },
    logout: async () => {
        await authApi.logout();
        set({ user: null, status: "anonymous" });
    },
    clearSession: () => set({ user: null, status: "anonymous" }),
}));
