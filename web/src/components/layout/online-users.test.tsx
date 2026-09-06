// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnlineUsers } from "@/components/layout/online-users";
import "@/i18n";

const presenceMocks = vi.hoisted(() => ({ heartbeatPresence: vi.fn(), fetchOnlineUsers: vi.fn() }));

vi.mock("@/services/api/presence", () => presenceMocks);

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    presenceMocks.heartbeatPresence.mockResolvedValue({ online: 3 });
    presenceMocks.fetchOnlineUsers.mockResolvedValue({ users: ["小***", "z***@qq.com", "小***"] });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function renderOnlineUsers(hidden = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
        <QueryClientProvider client={client}>
            <OnlineUsers hidden={hidden} />
        </QueryClientProvider>,
    );
}

describe("OnlineUsers", () => {
    it("shows the unique online account count returned by the heartbeat", async () => {
        renderOnlineUsers();

        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("3 人在线"));
        expect(presenceMocks.heartbeatPresence).toHaveBeenCalledTimes(1);
        expect(presenceMocks.fetchOnlineUsers).not.toHaveBeenCalled();
    });

    it("stays hidden when the heartbeat fails", async () => {
        presenceMocks.heartbeatPresence.mockRejectedValueOnce(new Error("offline"));
        const { container } = renderOnlineUsers();

        await waitFor(() => expect(presenceMocks.heartbeatPresence).toHaveBeenCalledTimes(1));
        expect(container.innerHTML).toBe("");
    });

    it("opens the masked list on click without merging matching labels", async () => {
        renderOnlineUsers();
        fireEvent.click(await screen.findByRole("button", { name: "3 人在线" }));

        const list = await screen.findByRole("list", { name: "在线用户" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(3);
        expect(within(list).getAllByText("小***")).toHaveLength(2);
        expect(within(list).getByText("z***@qq.com")).toBeTruthy();
        expect(presenceMocks.fetchOnlineUsers).toHaveBeenCalledTimes(1);
    });

    it("shows loading while the list request is pending", async () => {
        presenceMocks.fetchOnlineUsers.mockImplementation(() => new Promise(() => {}));
        renderOnlineUsers();
        fireEvent.click(await screen.findByRole("button", { name: "3 人在线" }));

        expect(await screen.findByLabelText("加载在线用户")).toBeTruthy();
        expect(screen.queryByRole("list")).toBeNull();
    });

    it("shows an empty state when no users remain online", async () => {
        presenceMocks.fetchOnlineUsers.mockResolvedValue({ users: [] });
        renderOnlineUsers();
        fireEvent.click(await screen.findByRole("button", { name: "3 人在线" }));

        expect(await screen.findByText("暂无在线用户")).toBeTruthy();
    });

    it("allows retrying a failed list request", async () => {
        presenceMocks.fetchOnlineUsers.mockRejectedValueOnce(new Error("offline"));
        renderOnlineUsers();
        fireEvent.click(await screen.findByRole("button", { name: "3 人在线" }));

        expect(await screen.findByText("在线用户加载失败")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "重试" }));
        expect(await screen.findByRole("list", { name: "在线用户" })).toBeTruthy();
        expect(presenceMocks.fetchOnlineUsers).toHaveBeenCalledTimes(2);
    });

    it("closes with Escape and fetches a fresh list when reopened", async () => {
        renderOnlineUsers();
        const button = await screen.findByRole("button", { name: "3 人在线" });
        fireEvent.click(button);
        await screen.findByRole("list", { name: "在线用户" });
        fireEvent.keyDown(button, { key: "Escape" });
        await waitFor(() => expect(button.getAttribute("aria-expanded")).toBe("false"));

        presenceMocks.fetchOnlineUsers.mockResolvedValue({ users: ["新***"] });
        fireEvent.click(button);
        expect(await screen.findByText("新***")).toBeTruthy();
        expect(presenceMocks.fetchOnlineUsers).toHaveBeenCalledTimes(2);
    });

    it("keeps sending heartbeats without loading a list when hidden", async () => {
        const { container } = renderOnlineUsers(true);

        await waitFor(() => expect(presenceMocks.heartbeatPresence).toHaveBeenCalledTimes(1));
        expect(container.innerHTML).toBe("");
        expect(presenceMocks.fetchOnlineUsers).not.toHaveBeenCalled();
    });
});
