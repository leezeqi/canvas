import { beforeEach, describe, expect, it, vi } from "vitest";

import { SYNC_REQUEST_TIMEOUT_MS, syncDomainRequest, syncFile } from "@/services/server-sync";

describe("server sync HTTP contract", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("reads the remote state from the backend error.details on a 409", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({ error: { code: "SYNC_CONFLICT", details: { version: 7, data: { records: [{ id: "remote" }] }, files: [] } } }), {
                status: 409,
                headers: { "Content-Type": "application/json" },
            }),
        ).mockResolvedValueOnce(
            new Response(JSON.stringify({ data: { version: 8, data: { records: [{ id: "merged" }] }, files: [] } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const result = await syncDomainRequest("canvas", { baseVersion: 6, data: { records: [{ id: "local" }] } });

        expect(result.version).toBe(8);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ baseVersion: 7 });
    });

    it("stops retrying after three conflicts and surfaces the server error", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ error: { code: "SYNC_CONFLICT", details: { version: 1, data: {}, files: [] } } }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
        }));

        await expect(syncDomainRequest("canvas", { baseVersion: 0, data: {} })).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("preserves authentication and slash-separated storage keys for file requests", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["ok"], { type: "image/png" }), { status: 200 }));

        await syncFile("image:folder/item.png", new Blob(["x"], { type: "image/png" }));

        expect(fetchMock).toHaveBeenCalledWith("/api/sync/files/image%3Afolder/item.png", expect.objectContaining({ method: "PUT", credentials: "include" }));
    });

    it("surfaces unauthenticated sync responses instead of treating them as empty state", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "请先登录" } }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        }));

        await expect(syncDomainRequest("canvas", { baseVersion: 0, data: {} })).rejects.toThrow("请先登录");
    });

    it("aborts a sync file request when the request timeout is reached", async () => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        }));

        const request = syncFile("image:stalled", new Blob(["x"], { type: "image/png" }));
        const assertion = expect(request).rejects.toThrow("同步请求超时");
        await vi.advanceTimersByTimeAsync(SYNC_REQUEST_TIMEOUT_MS);

        await assertion;
        vi.useRealTimers();
    });
});
