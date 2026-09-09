// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accountStorageKey, scheduleAccountSync, startAccountSync, stopAccountSync } from "@/services/server-sync";
import { resolveImageUrl } from "@/services/image-storage";
import { defaultConfig, useConfigStore, type AiConfig } from "@/stores/use-config-store";

const mocks = vi.hoisted(() => {
    const values = new Map<string, unknown>();
    const metadata = { getItem: vi.fn(), setItem: vi.fn() };
    const emptyStore = {
        getState: () => ({ hydrated: true, projects: [], assets: [], sources: [], plugins: [], schedule: {}, theme: "dark", replaceProjects: vi.fn(), replaceAssets: vi.fn() }),
        setState: vi.fn(),
        subscribe: () => () => undefined,
    };
    return { values, metadata, emptyStore };
});

vi.mock("localforage", () => ({ default: { createInstance: ({ storeName }: { storeName: string }) => storeName === "server_sync_metadata" ? mocks.metadata : { iterate: async () => undefined, clear: async () => undefined } } }));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("@/stores/canvas/use-canvas-store", () => ({ useCanvasStore: mocks.emptyStore }));
vi.mock("@/stores/use-asset-store", () => ({ useAssetStore: mocks.emptyStore }));
vi.mock("@/stores/use-prompt-source-store", () => ({ usePromptSourceStore: mocks.emptyStore }));
vi.mock("@/stores/canvas/use-plugin-store", () => ({ usePluginStore: mocks.emptyStore }));
vi.mock("@/stores/use-theme-store", () => ({ useThemeStore: mocks.emptyStore }));
vi.mock("@/services/file-storage", () => ({ getMediaBlob: vi.fn(), resolveMediaUrl: vi.fn(), setMediaBlob: vi.fn() }));
vi.mock("@/services/image-storage", () => ({ getImageBlob: vi.fn(), resolveImageUrl: vi.fn(), setImageBlob: vi.fn() }));

const user = { id: "config-sync-user", email: "user@example.com", name: null, avatarUrl: null, provider: "password" };
const snapshotKey = `${accountStorageKey(user.id, "config")}:snapshot`;
const configFor = (name: string): AiConfig => ({ ...defaultConfig, channels: [{ ...defaultConfig.channels[0], baseUrl: `https://${name}.example.com`, apiKey: `${name}-key` }] });
const payloadFor = (config: AiConfig) => ({ config, __syncTombstones: [] });
const jsonResponse = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

type ConfigRequest = { body: { baseVersion: number; data: ReturnType<typeof payloadFor> }; response: ReturnType<typeof deferred<Response>> };
let requests: ConfigRequest[];
let remoteConfig: AiConfig;

function saveChannels(name: string) {
    useConfigStore.getState().updateConfig("channels", configFor(name).channels);
}

async function respond(index: number, version: number) {
    const request = requests[index];
    request.response.resolve(jsonResponse({ version, data: request.body.data, files: [] }));
    await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    remoteConfig = configFor("saved");
    mocks.values.clear();
    mocks.values.set("infinite-canvas:server-sync:active-account", user.id);
    mocks.metadata.getItem.mockReset().mockImplementation(async (key: string) => mocks.values.get(key) ?? null);
    mocks.metadata.setItem.mockReset().mockImplementation(async (key: string, value: unknown) => { mocks.values.set(key, value); return value; });
    useConfigStore.setState({ config: configFor("saved") });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        if (String(input) === "/api/sync/state") return jsonResponse({ domains: { config: { version: 1, data: payloadFor(remoteConfig), files: [] } }, files: [] });
        if (String(input) === "/api/sync/domains/config") {
            const request = { body: JSON.parse(String(init?.body)), response: deferred<Response>() };
            requests.push(request);
            return request.response.promise;
        }
        throw new Error(`Unexpected request: ${String(input)}`);
    });
});

afterEach(async () => {
    await stopAccountSync();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("account configuration synchronization", () => {
    it("keeps credentials saved during a request and automatically uploads them", async () => {
        await startAccountSync(user);
        scheduleAccountSync("config");
        await vi.advanceTimersByTimeAsync(700);

        saveChannels("edited");
        await respond(0, 2);

        expect(useConfigStore.getState().config.channels).toEqual(configFor("edited").channels);
        expect(mocks.values.get(snapshotKey)).toEqual(payloadFor(configFor("saved")));
        await vi.advanceTimersByTimeAsync(700);
        expect(requests[1].body).toMatchObject({ baseVersion: 2, data: { config: { channels: configFor("edited").channels } } });
        await respond(1, 3);
        expect(mocks.values.get(snapshotKey)).toMatchObject({ config: { channels: configFor("edited").channels } });
    });

    it("serializes config requests and reads the latest credentials and version when a queued request starts", async () => {
        await startAccountSync(user);
        scheduleAccountSync("config");
        await vi.advanceTimersByTimeAsync(700);
        saveChannels("intermediate");
        await vi.advanceTimersByTimeAsync(700);

        expect(requests).toHaveLength(1);
        saveChannels("latest");
        await respond(0, 2);

        expect(requests).toHaveLength(2);
        expect(requests[1].body).toMatchObject({ baseVersion: 2, data: { config: { channels: configFor("latest").channels } } });
        await respond(1, 3);
        expect(useConfigStore.getState().config.channels).toEqual(configFor("latest").channels);
        expect(mocks.values.get(snapshotKey)).toMatchObject({ config: { channels: configFor("latest").channels } });
    });

    it("keeps edits made while the response snapshot is being persisted", async () => {
        await startAccountSync(user);
        scheduleAccountSync("config");
        await vi.advanceTimersByTimeAsync(700);
        const persisted = deferred<void>();
        mocks.metadata.setItem.mockImplementationOnce(async (key: string, value: unknown) => {
            await persisted.promise;
            mocks.values.set(key, value);
            return value;
        });
        await respond(0, 2);

        saveChannels("edited");
        persisted.resolve();
        await vi.advanceTimersByTimeAsync(0);

        expect(useConfigStore.getState().config.channels).toEqual(configFor("edited").channels);
        await vi.advanceTimersByTimeAsync(700);
        expect(requests[1].body.data.config.channels).toEqual(configFor("edited").channels);
        await respond(1, 3);
    });

    it("keeps remote preferences from a conflict retry together with credentials saved during that request", async () => {
        await startAccountSync(user);
        scheduleAccountSync("config");
        await vi.advanceTimersByTimeAsync(700);
        saveChannels("edited");
        requests[0].response.resolve(jsonResponse({ error: { details: { version: 2, data: payloadFor({ ...remoteConfig, quality: "high" }), files: [] } } }, 409));
        await vi.advanceTimersByTimeAsync(0);

        expect(requests[1].body).toMatchObject({ baseVersion: 2, data: { config: { quality: "high" } } });
        await respond(1, 3);
        expect(useConfigStore.getState().config).toMatchObject({ channels: configFor("edited").channels, quality: "high" });
        await vi.advanceTimersByTimeAsync(700);
        expect(requests[2].body).toMatchObject({ baseVersion: 3, data: { config: { channels: configFor("edited").channels, quality: "high" } } });
        await respond(2, 4);
    });

    it("preserves credentials saved while the initial server state is loading and restores untouched remote preferences", async () => {
        const state = deferred<Response>();
        vi.mocked(fetch).mockImplementationOnce(() => state.promise);
        const startup = startAccountSync(user);
        await vi.advanceTimersByTimeAsync(0);
        saveChannels("edited");
        remoteConfig = { ...remoteConfig, quality: "high" };
        state.resolve(jsonResponse({ domains: { config: { version: 1, data: payloadFor(remoteConfig), files: [] } }, files: [] }));
        await vi.advanceTimersByTimeAsync(0);

        expect(useConfigStore.getState().config).toMatchObject({ channels: configFor("edited").channels, quality: "high" });
        expect(requests[0].body.data.config).toMatchObject({ channels: configFor("edited").channels, quality: "high" });
        await respond(0, 2);
        await startup;
    });

    it("uploads edits made after the initial config was applied but before subscriptions were installed", async () => {
        const persisted = deferred<void>();
        mocks.metadata.setItem.mockImplementation(async (key: string, value: unknown) => {
            if (key === snapshotKey) await persisted.promise;
            mocks.values.set(key, value);
            return value;
        });
        const startup = startAccountSync(user);
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.metadata.setItem).toHaveBeenCalledWith(snapshotKey, payloadFor(remoteConfig));

        saveChannels("edited");
        persisted.resolve();
        await startup;
        await vi.advanceTimersByTimeAsync(700);

        expect(requests[0].body.data.config.channels).toEqual(configFor("edited").channels);
        await respond(0, 2);
    });

    it("schedules saved credentials while another domain is waiting for asset hydration", async () => {
        await startAccountSync(user);
        const image = deferred<string>();
        vi.mocked(resolveImageUrl).mockReturnValueOnce(image.promise);
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ version: 1, data: { assets: [{ id: "asset", kind: "image", data: { storageKey: "image:asset" } }] }, files: [] }));
        scheduleAccountSync("assets");
        await vi.advanceTimersByTimeAsync(700);
        expect(resolveImageUrl).toHaveBeenCalledWith("image:asset", "");

        saveChannels("edited");
        await vi.advanceTimersByTimeAsync(700);

        expect(requests[0].body.data.config.channels).toEqual(configFor("edited").channels);
        await respond(0, 2);
        image.resolve("blob:asset");
        await vi.advanceTimersByTimeAsync(0);
    });

    it("restores authoritative remote credentials when no edit was made during startup", async () => {
        remoteConfig = configFor("remote");

        await startAccountSync(user);

        expect(useConfigStore.getState().config.channels).toEqual(remoteConfig.channels);
        expect(mocks.values.get(snapshotKey)).toEqual(payloadFor(remoteConfig));
        expect(requests).toHaveLength(0);
    });

    it("does not block a new account behind an old request or apply its late response", async () => {
        await startAccountSync(user);
        scheduleAccountSync("config");
        await vi.advanceTimersByTimeAsync(700);
        await stopAccountSync();
        const nextUser = { ...user, id: "next-config-user" };
        remoteConfig = { ...configFor("next-account"), quality: "high" };
        await startAccountSync(nextUser);
        saveChannels("next-edited");
        await vi.advanceTimersByTimeAsync(700);

        try {
            expect(requests).toHaveLength(2);
            expect(requests[1].body.baseVersion).toBe(1);
            await respond(1, 2);
            await respond(0, 20);

            expect(useConfigStore.getState().config).toMatchObject({ channels: configFor("next-edited").channels, quality: "high" });
            expect(mocks.values.get(`${accountStorageKey(nextUser.id, "config")}:snapshot`)).toMatchObject({ config: { channels: configFor("next-edited").channels, quality: "high" } });
            scheduleAccountSync("config");
            await vi.advanceTimersByTimeAsync(700);
            expect(requests[2].body.baseVersion).toBe(2);
            await respond(2, 3);
        } finally {
            for (let index = 0; index < requests.length; index++) await respond(index, index + 2);
        }
    });
});
