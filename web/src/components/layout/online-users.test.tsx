// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnlineUsers } from "@/components/layout/online-users";
import "@/i18n";

const presenceMocks = vi.hoisted(() => ({ heartbeatPresence: vi.fn() }));

vi.mock("@/services/api/presence", () => presenceMocks);

beforeEach(() => {
    vi.clearAllMocks();
    presenceMocks.heartbeatPresence.mockResolvedValue({ online: 3 });
});
afterEach(cleanup);

describe("OnlineUsers", () => {
    it("shows the unique online account count returned by the heartbeat", async () => {
        render(<OnlineUsers />);

        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("3 人在线"));
        expect(presenceMocks.heartbeatPresence).toHaveBeenCalledTimes(1);
    });

    it("stays hidden when the heartbeat fails", async () => {
        presenceMocks.heartbeatPresence.mockRejectedValueOnce(new Error("offline"));
        const { container } = render(<OnlineUsers />);

        await waitFor(() => expect(presenceMocks.heartbeatPresence).toHaveBeenCalledTimes(1));
        expect(container.innerHTML).toBe("");
    });
});
