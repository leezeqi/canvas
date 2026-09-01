// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { AuthGuard } from "@/components/auth/auth-guard";
import "@/i18n";
import { useUserStore } from "@/stores/use-user-store";

const syncMocks = vi.hoisted(() => ({
    startAccountSync: vi.fn(),
    stopAccountSync: vi.fn(),
}));

vi.mock("@/services/server-sync", () => syncMocks);

function CurrentLocation() {
    const location = useLocation();
    return <span data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</span>;
}

beforeEach(() => {
    syncMocks.startAccountSync.mockResolvedValue(undefined);
    syncMocks.stopAccountSync.mockResolvedValue(undefined);
    useUserStore.setState({ user: null, status: "idle" });
});

afterEach(cleanup);

describe("AuthGuard", () => {
    it("redirects an anonymous business route to login and preserves its same-origin location", async () => {
        useUserStore.setState({ user: null, status: "anonymous" });

        render(
            <MemoryRouter initialEntries={["/canvas/project-1?mode=edit#node-2"]}>
                <Routes>
                    <Route element={<AuthGuard />}>
                        <Route path="/canvas/:id" element={<span>private canvas</span>} />
                    </Route>
                    <Route path="/login" element={<CurrentLocation />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/login?returnTo=%2Fcanvas%2Fproject-1%3Fmode%3Dedit%23node-2"));
        expect(screen.queryByText("private canvas")).toBeNull();
    });

    it("renders the protected outlet for an authenticated user", async () => {
        useUserStore.setState({
            user: { id: "user-1", email: "user@example.com", name: "测试用户", avatarUrl: null, provider: "local" },
            status: "authenticated",
        });

        render(
            <MemoryRouter initialEntries={["/canvas/project-1"]}>
                <Routes>
                    <Route element={<AuthGuard />}>
                        <Route path="/canvas/:id" element={<span>private canvas</span>} />
                    </Route>
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByText("private canvas")).toBeTruthy());
    });

    it("does not block the protected outlet while account sync is still running", async () => {
        syncMocks.startAccountSync.mockImplementationOnce(() => new Promise<void>(() => undefined));
        useUserStore.setState({
            user: { id: "user-1", email: "user@example.com", name: "测试用户", avatarUrl: null, provider: "local" },
            status: "authenticated",
        });

        render(
            <MemoryRouter initialEntries={["/canvas/project-1"]}>
                <Routes>
                    <Route element={<AuthGuard />}>
                        <Route path="/canvas/:id" element={<span>private canvas</span>} />
                    </Route>
                </Routes>
            </MemoryRouter>,
        );

        expect(await screen.findByText("private canvas")).toBeTruthy();
        expect(screen.getByRole("status").textContent).toContain("同步");
    });
});
