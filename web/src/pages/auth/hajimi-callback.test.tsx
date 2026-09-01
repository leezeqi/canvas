// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

import "@/i18n";
import HajimiCallbackPage from "@/pages/auth/hajimi-callback";
import { useUserStore } from "@/stores/use-user-store";

afterEach(() => {
    cleanup();
    useUserStore.setState({ user: null, status: "idle" });
    window.history.replaceState(null, "", "/");
});

describe("HajimiCallbackPage", () => {
    it("removes the one-time ticket fragment before exchanging it", async () => {
        const exchangeHajimi = vi.fn(() => new Promise<never>(() => undefined));
        useUserStore.setState({ exchangeHajimi });
        window.history.replaceState(null, "", "/auth/hajimi/callback?returnTo=%2Fcanvas#ticket=one-time-ticket");

        render(
            <BrowserRouter>
                <HajimiCallbackPage />
            </BrowserRouter>,
        );

        expect(window.location.hash).toBe("");
        expect(window.location.pathname).toBe("/auth/hajimi/callback");
        expect(window.location.search).toBe("?returnTo=%2Fcanvas");
        await waitFor(() => expect(exchangeHajimi).toHaveBeenCalledOnce());
        expect(exchangeHajimi).toHaveBeenCalledWith("one-time-ticket");
    });
});
