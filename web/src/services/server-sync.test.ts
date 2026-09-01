import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    SYNC_DOMAINS,
    accountStorageKey,
    collectStorageKeys,
    mergeSyncRecords,
    mergeRemoteDomainData,
    shouldMigrateLegacyData,
    syncDomainRequest,
} from "@/services/server-sync";

describe("server sync helpers", () => {
    it("uses stable per-account namespaces and excludes ephemeral domains", () => {
        expect(accountStorageKey("user-1", "canvas")).toBe("infinite-canvas:account:user-1:canvas");
        expect(SYNC_DOMAINS).toEqual(["canvas", "assets", "image-workbench", "video-workbench", "config", "prompt-sources", "plugins", "theme"]);
        expect(SYNC_DOMAINS).not.toContain("webdav");
        expect(SYNC_DOMAINS).not.toContain("agent");
        expect(SYNC_DOMAINS).not.toContain("prompt-cache");
    });

    it("only migrates legacy local data into a genuinely empty account once", () => {
        expect(shouldMigrateLegacyData({ remoteVersion: 0, legacyHasData: true, alreadyMigrated: false })).toBe(true);
        expect(shouldMigrateLegacyData({ remoteVersion: 2, legacyHasData: true, alreadyMigrated: false })).toBe(false);
        expect(shouldMigrateLegacyData({ remoteVersion: 0, legacyHasData: true, alreadyMigrated: true })).toBe(false);
        expect(shouldMigrateLegacyData({ remoteVersion: 0, legacyHasData: false, alreadyMigrated: false })).toBe(false);
    });

    it("merges records by updatedAt and applies tombstones", () => {
        const result = mergeSyncRecords(
            [{ id: "same", updatedAt: "2026-01-02T00:00:00Z", value: "local" }, { id: "local", updatedAt: "2026-01-01T00:00:00Z" }],
            [{ id: "same", updatedAt: "2026-01-03T00:00:00Z", value: "remote" }, { id: "remote", updatedAt: "2026-01-01T00:00:00Z" }],
            [{ id: "remote", deletedAt: "2026-01-04T00:00:00Z" }],
        );
        expect(result.records).toEqual([{ id: "same", updatedAt: "2026-01-03T00:00:00Z", value: "remote" }, { id: "local", updatedAt: "2026-01-01T00:00:00Z" }]);
        expect(result.tombstones).toEqual([{ id: "remote", deletedAt: "2026-01-04T00:00:00Z" }]);
    });

    it("collects media keys from remote records before applying them", () => {
        const merged = mergeRemoteDomainData(
            "image-workbench",
            { logs: [] },
            { version: 1, data: { logs: [{ id: "remote-log", images: [{ storageKey: "image:remote" }] }] }, files: [] },
            true,
        );
        expect(collectStorageKeys(merged?.data)).toEqual(["image:remote"]);
    });

    it("restores the remote channel configuration on a new device", () => {
        const merged = mergeRemoteDomainData(
            "config",
            { config: { baseUrl: "https://api.openai.com", channels: [] } },
            {
                version: 1,
                data: {
                    config: {
                        baseUrl: "https://custom.example.com",
                        channels: [{ id: "custom", name: "自定义渠道", baseUrl: "https://custom.example.com", apiKey: "key", apiFormat: "openai", models: [{ name: "custom-image", capability: "image" }] }],
                    },
                },
                files: [],
            },
            true,
        );
        expect((merged?.data as { config: { baseUrl: string; channels: unknown[] } }).config.baseUrl).toBe("https://custom.example.com");
        expect((merged?.data as { config: { channels: unknown[] } }).config.channels).toHaveLength(1);
    });
});

describe("syncDomainRequest", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("retries a 409 with the returned remote version and data", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({ version: 3, data: { records: [{ id: "remote", updatedAt: "2026-01-02" }], tombstones: [] }, files: [] }), { status: 409, headers: { "Content-Type": "application/json" } }),
        ).mockResolvedValueOnce(
            new Response(JSON.stringify({ version: 4, data: { records: [{ id: "merged" }], tombstones: [] }, files: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
        );
        const response = await syncDomainRequest("canvas", { baseVersion: 2, data: { records: [{ id: "local" }], tombstones: [] } });
        expect(response.version).toBe(4);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ baseVersion: 3 });
    });

    it("does not overwrite a newer remote configuration with a stale browser snapshot", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({ error: { details: { version: 3, data: { config: { baseUrl: "https://custom.example.com", channels: [{ id: "custom" }] } }, files: [] } } }), { status: 409, headers: { "Content-Type": "application/json" } }),
        ).mockResolvedValueOnce(
            new Response(JSON.stringify({ version: 4, data: { config: { baseUrl: "https://custom.example.com", channels: [{ id: "custom" }] } }, files: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
        );
        await syncDomainRequest(
            "config",
            { baseVersion: 2, data: { config: { baseUrl: "https://api.openai.com", channels: [] } } },
            0,
            { config: { baseUrl: "https://api.openai.com", channels: [] } },
        );
        expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ baseVersion: 3, data: { config: { baseUrl: "https://custom.example.com" } } });
    });
});
