import localforage from "localforage";

import { getMediaBlob, resolveMediaUrl, setMediaBlob } from "@/services/file-storage";
import { getImageBlob, resolveImageUrl, setImageBlob } from "@/services/image-storage";
import { useConfigStore, defaultConfig } from "@/stores/use-config-store";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { usePluginStore } from "@/stores/canvas/use-plugin-store";
import type { AuthUser } from "@/services/api/auth";
import { DEFAULT_PROMPT_SOURCES } from "@/services/api/prompt-source-presets";

export const SYNC_DOMAINS = ["canvas", "assets", "image-workbench", "video-workbench", "config", "prompt-sources", "plugins", "theme"] as const;
export type SyncDomain = (typeof SYNC_DOMAINS)[number];

type SyncFile = { storageKey: string; bytes: number; mimeType: string };
export type SyncTombstone = { id: string; deletedAt: string };
export type SyncData = { records: Array<Record<string, unknown>>; tombstones: SyncTombstone[] };
export type SyncDomainResponse = { version: number; data: unknown; files: SyncFile[]; tombstones?: SyncTombstone[] };
type SyncDomainPayload = { baseVersion: number; data: unknown; tombstones?: SyncTombstone[] };

const metadataStore = localforage.createInstance({ name: "infinite-canvas", storeName: "server_sync_metadata" });
const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
const STORAGE_KEY = "infinite-canvas:server-sync:active-account";
const LEGACY_MIGRATION_KEY = "legacy-migrated";
const SYNC_TOMBSTONES_FIELD = "__syncTombstones";
const DEBOUNCE_MS = 700;
export const SYNC_REQUEST_TIMEOUT_MS = 30_000;
export const SYNC_ROUND_TIMEOUT_MS = 5 * 60_000;
const SYNC_TIMEOUT_MESSAGE = "同步请求超时，请稍后重试";
const SYNC_ROUND_TIMEOUT_MESSAGE = "账号数据同步超时，已保留本地数据并将在稍后重试";
const subscriptions: Array<() => void> = [];
const timers = new Map<SyncDomain, ReturnType<typeof setTimeout>>();
const versions = new Map<SyncDomain, number>();
let activeUserId = "";
let applying = false;
let running = false;
let activeSyncController: AbortController | null = null;
let syncLockHeld = false;

export function accountStorageKey(userId: string, domain: string) {
    return `infinite-canvas:account:${encodeURIComponent(userId)}:${domain}`;
}

export function shouldMigrateLegacyData(input: { remoteVersion: number; legacyHasData: boolean; alreadyMigrated: boolean }) {
    return input.remoteVersion === 0 && input.legacyHasData && !input.alreadyMigrated;
}

export function mergeSyncRecords(local: Array<Record<string, unknown>>, remote: Array<Record<string, unknown>>, tombstones: SyncTombstone[] = []) {
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of remote) if (typeof item.id === "string" && item.id) byId.set(item.id, item);
    for (const item of local) {
        if (typeof item.id !== "string" || !item.id) continue;
        const current = byId.get(item.id);
        if (!current || timeOf(item.updatedAt) >= timeOf(current.updatedAt)) byId.set(item.id, item);
    }
    const tombstoneById = new Map<string, SyncTombstone>();
    for (const tombstone of tombstones) {
        if (!tombstone.id) continue;
        const current = tombstoneById.get(tombstone.id);
        if (!current || timeOf(tombstone.deletedAt) > timeOf(current.deletedAt)) tombstoneById.set(tombstone.id, tombstone);
    }
    for (const tombstone of tombstoneById.values()) {
        const item = byId.get(tombstone.id);
        if (item && timeOf(item.updatedAt) <= timeOf(tombstone.deletedAt)) byId.delete(tombstone.id);
    }
    return { records: Array.from(byId.values()), tombstones: Array.from(tombstoneById.values()) };
}

export async function syncDomainRequest(domain: SyncDomain, payload: SyncDomainPayload, retries = 0, baseData?: unknown): Promise<SyncDomainResponse> {
    const response = await syncFetch(`/api/sync/domains/${encodeURIComponent(domain)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // The API persists the domain document; tombstones are merged client-side
        // and intentionally remain out of the strict backend request schema.
        body: JSON.stringify({ baseVersion: payload.baseVersion, data: payload.data }),
    });
    const body = await readJson(response);
    if (response.status === 409 && retries < 3) {
        const remote = normalizeResponse(body, domain);
        const merged = domain === "config" ? mergeConfigPayload(baseData, payload.data, remote.data, [...(payload.tombstones || []), ...(remote.tombstones || [])]) : mergeDomainPayload(payload.data, remote.data, [...(payload.tombstones || []), ...(remote.tombstones || [])]);
        return syncDomainRequest(domain, { baseVersion: remote.version, data: merged.data, tombstones: merged.tombstones }, retries + 1, baseData);
    }
    if (!response.ok) throw new Error(body?.error?.message || `同步失败（HTTP ${response.status}）`);
    return normalizeResponse(body, domain);
}

export async function getSyncDomain(domain: SyncDomain): Promise<SyncDomainResponse> {
    const response = await syncFetch(`/api/sync/domains/${encodeURIComponent(domain)}`, { credentials: "include" });
    const body = await readJson(response);
    if (response.status === 404) return { version: 0, data: null, files: [] };
    if (!response.ok) throw new Error(body?.error?.message || `读取同步数据失败（HTTP ${response.status}）`);
    return normalizeResponse(body, domain);
}

export async function getSyncState() {
    const response = await syncFetch("/api/sync/state", { credentials: "include" });
    const body = await readJson(response);
    if (!response.ok) throw new Error(body?.error?.message || `读取同步状态失败（HTTP ${response.status}）`);
    const value = body?.data || body;
    const files = Array.isArray(value?.files) ? value.files.map((file: any) => ({ storageKey: String(file.storageKey || ""), bytes: Number(file.bytes ?? file.size ?? 0), mimeType: String(file.mimeType || file.contentType || "application/octet-stream") })) : [];
    return { domains: (value?.domains || {}) as Record<string, SyncDomainResponse>, files };
}

export async function syncFile(storageKey: string, blob?: Blob, mimeType = "application/octet-stream") {
    const path = encodeURIComponent(storageKey).replace(/%2F/g, "/");
    if (blob) {
        const response = await syncFetch(`/api/sync/files/${path}`, { method: "PUT", credentials: "include", headers: { "Content-Type": mimeType }, body: blob });
        if (!response.ok) throw new Error(`上传媒体失败（HTTP ${response.status}）`);
        return;
    }
    const response = await syncFetch(`/api/sync/files/${path}`, { credentials: "include" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`下载媒体失败（HTTP ${response.status}）`);
    return response.blob();
}

export async function startAccountSync(user: AuthUser) {
    if (running && activeUserId === user.id) return;
    if (running) await stopAccountSync();
    activeUserId = user.id;
    running = true;
    const controller = new AbortController();
    activeSyncController = controller;
    try {
        await withTimeout(syncAccountData(user, controller.signal), SYNC_ROUND_TIMEOUT_MS, () => controller.abort(new Error(SYNC_ROUND_TIMEOUT_MESSAGE)));
    } catch (error) {
        await cleanupSyncRuntime(false);
        throw error;
    } finally {
        activeSyncController = null;
    }
}

async function syncAccountData(user: AuthUser, signal: AbortSignal) {
    await waitForHydration(signal);
    throwIfSyncAborted(signal);
    const previousAccount = await metadataStore.getItem<string>(STORAGE_KEY);
    throwIfSyncAborted(signal);
    const canMigrate = !previousAccount;
    if (previousAccount && previousAccount !== user.id) await clearLocalAccountState();
    const state = await getSyncState();
    throwIfSyncAborted(signal);
    const domainData = SYNC_DOMAINS.map((domain) => {
        const remote = state.domains[domain];
        return [domain, remote ? { ...remote, files: state.files } : { version: 0, data: null, files: state.files }] as const;
    });
    for (const [domain, remote] of domainData) {
        versions.set(domain, remote.version);
        const local = await readDomain(domain);
        throwIfSyncAborted(signal);
        const mergedRemote = mergeRemoteDomainData(domain, local, remote, canMigrate);
        await syncRemoteFiles(remote.files, mergedRemote?.data ?? local);
        throwIfSyncAborted(signal);
        const legacyHasData = hasDomainData(local);
        const alreadyMigrated = Boolean(await metadataStore.getItem(`${accountStorageKey(user.id, domain)}:${LEGACY_MIGRATION_KEY}`));
        if (shouldMigrateLegacyData({ remoteVersion: remote.version, legacyHasData, alreadyMigrated: alreadyMigrated || !canMigrate })) {
            await pushDomain(domain, local, remote.version);
            throwIfSyncAborted(signal);
            await metadataStore.setItem(`${accountStorageKey(user.id, domain)}:${LEGACY_MIGRATION_KEY}`, true);
            continue;
        }
        if (mergedRemote) {
            await applyDomain(domain, mergedRemote.data);
            throwIfSyncAborted(signal);
            await metadataStore.setItem(`${accountStorageKey(user.id, domain)}:snapshot`, mergedRemote.data);
            if (JSON.stringify(mergedRemote.data) !== JSON.stringify(remote.data)) await pushDomain(domain, mergedRemote.data, remote.version);
            else await syncLocalFiles(mergedRemote.data, remote.files);
        }
    }
    await metadataStore.setItem(STORAGE_KEY, user.id);
    throwIfSyncAborted(signal);
    installSubscriptions();
    window.addEventListener("online", compensate);
    document.addEventListener("visibilitychange", compensate);
}

export async function stopAccountSync() {
    if (!running) return;
    await cleanupSyncRuntime(true);
}

async function cleanupSyncRuntime(clearLocal: boolean) {
    subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    window.removeEventListener("online", compensate);
    document.removeEventListener("visibilitychange", compensate);
    if (clearLocal) await clearLocalAccountState();
    versions.clear();
    activeUserId = "";
    running = false;
}

async function withAccountSyncLock<T>(userId: string, task: () => Promise<T>): Promise<T | undefined> {
    if (syncLockHeld) return task();
    const lockManager = typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined;
    if (!lockManager) return task();
    let acquired = false;
    let result: T | undefined;
    await lockManager.request(`infinite-canvas:sync:${encodeURIComponent(userId)}`, async (lock) => {
        if (!lock) return;
        acquired = true;
        syncLockHeld = true;
        try {
            result = await task();
        } finally {
            syncLockHeld = false;
        }
    });
    return acquired ? result : undefined;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void) {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            onTimeout();
            reject(new Error(SYNC_ROUND_TIMEOUT_MESSAGE));
        }, timeoutMs);
        promise.then(resolve, reject).finally(() => clearTimeout(timer));
    });
}

async function syncFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const parentSignal = activeSyncController?.signal;
    const abort = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abort();
    else parentSignal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error(SYNC_TIMEOUT_MESSAGE));
    }, SYNC_REQUEST_TIMEOUT_MS);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
        if (timedOut) throw new Error(SYNC_TIMEOUT_MESSAGE);
        throw error;
    } finally {
        clearTimeout(timer);
        parentSignal?.removeEventListener("abort", abort);
    }
}

async function pushDomain(domain: SyncDomain, data: unknown, baseVersion = versions.get(domain) || 0) {
    if (!activeUserId) return;
    await withAccountSyncLock(activeUserId, async () => {
        const snapshotKey = `${accountStorageKey(activeUserId, domain)}:snapshot`;
        const previous = await metadataStore.getItem<unknown>(snapshotKey);
        const tombstones = deriveTombstones(previous, data);
        const persistedData = attachTombstones(data, tombstones);
        const response = await syncDomainRequest(domain, { baseVersion, data: persistedData, tombstones }, 0, previous);
        versions.set(domain, response.version);
        await metadataStore.setItem(snapshotKey, response.data ?? persistedData);
        await syncLocalFiles(data, response.files);
        if (response.data != null) await applyDomain(domain, response.data);
    });
}

function deriveTombstones(previous: unknown, current: unknown): SyncTombstone[] {
    const previousTombstones = extractTombstones(previous);
    const oldRecords = collectRecords(previous);
    const currentIds = new Set(collectRecords(current).map((item) => String(item.id)));
    const deletedAt = new Date().toISOString();
    const next = oldRecords.filter((item) => typeof item.id === "string" && !currentIds.has(item.id)).map((item) => ({ id: item.id as string, deletedAt }));
    return mergeSyncRecords([], [], [...previousTombstones, ...next]).tombstones;
}

function extractTombstones(value: unknown): SyncTombstone[] {
    if (!value || typeof value !== "object") return [];
    const candidate = (value as Record<string, unknown>)[SYNC_TOMBSTONES_FIELD];
    return Array.isArray(candidate) ? candidate.filter((item): item is SyncTombstone => Boolean(item && typeof item === "object" && typeof (item as any).id === "string" && typeof (item as any).deletedAt === "string")) : [];
}

function attachTombstones(data: unknown, tombstones: SyncTombstone[]) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    return { ...(data as Record<string, unknown>), [SYNC_TOMBSTONES_FIELD]: tombstones };
}

function collectRecords(value: unknown): Array<Record<string, unknown>> {
    if (!value || typeof value !== "object") return [];
    const records: Array<Record<string, unknown>> = [];
    for (const child of Object.values(value as Record<string, unknown>)) {
        if (!Array.isArray(child)) continue;
        for (const item of child) if (item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string") records.push(item as Record<string, unknown>);
    }
    return records;
}

async function syncRemoteFiles(files: SyncFile[], data: unknown) {
    const keys = new Set(collectStorageKeys(data));
    for (const file of files) {
        if (!keys.has(file.storageKey)) continue;
        const local = file.storageKey.startsWith("image:") ? await getImageBlob(file.storageKey) : await getMediaBlob(file.storageKey);
        if (local && local.size === file.bytes) continue;
        await downloadSyncFile(file.storageKey);
    }
}

async function syncLocalFiles(data: unknown, remoteFiles: SyncFile[]) {
    if (!activeUserId) return;
    await withAccountSyncLock(activeUserId, () => syncLocalFilesUnlocked(data, remoteFiles));
}

async function syncLocalFilesUnlocked(data: unknown, remoteFiles: SyncFile[]) {
    const remote = new Map(remoteFiles.map((file) => [file.storageKey, file]));
    for (const storageKey of collectStorageKeys(data)) {
        const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        if (!blob) continue;
        const known = remote.get(storageKey);
        if (!known || known.bytes !== blob.size) await uploadSyncFile(storageKey);
    }
}

export function collectStorageKeys(value: unknown, result = new Set<string>()): string[] {
    if (typeof value === "string") {
        if (/^(image|video|audio|file|video-reference|audio-reference):/.test(value)) result.add(value);
    } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
            if (key === "storageKey" && typeof child === "string") result.add(child);
            collectStorageKeys(child, result);
        }
    }
    return Array.from(result);
}

function installSubscriptions() {
    if (subscriptions.length) return;
    subscriptions.push(useCanvasStore.subscribe(() => schedule("canvas")));
    subscriptions.push(useAssetStore.subscribe(() => schedule("assets")));
    subscriptions.push(useConfigStore.subscribe(() => schedule("config")));
    subscriptions.push(usePromptSourceStore.subscribe(() => schedule("prompt-sources")));
    subscriptions.push(usePluginStore.subscribe(() => schedule("plugins")));
    subscriptions.push(useThemeStore.subscribe(() => schedule("theme")));
}

function schedule(domain: SyncDomain) {
    if (!running || applying) return;
    const existing = timers.get(domain);
    if (existing) clearTimeout(existing);
    timers.set(domain, setTimeout(() => {
        timers.delete(domain);
        void readDomain(domain).then((data) => pushDomain(domain, data).catch(() => undefined));
    }, DEBOUNCE_MS));
}

export function scheduleAccountSync(domain: SyncDomain) {
    schedule(domain);
}

function compensate() {
    if (!running || !navigator.onLine || document.visibilityState === "hidden") return;
    for (const domain of SYNC_DOMAINS) schedule(domain);
}

async function readDomain(domain: SyncDomain): Promise<unknown> {
    if (domain === "canvas") return { projects: useCanvasStore.getState().projects };
    if (domain === "assets") return { assets: useAssetStore.getState().assets };
    if (domain === "config") return { config: useConfigStore.getState().config };
    if (domain === "prompt-sources") return { sources: usePromptSourceStore.getState().sources, schedule: usePromptSourceStore.getState().schedule };
    if (domain === "plugins") return { plugins: usePluginStore.getState().plugins };
    if (domain === "theme") return { theme: useThemeStore.getState().theme };
    const store = domain === "image-workbench" ? imageLogStore : videoLogStore;
    const logs: Record<string, unknown>[] = [];
    await store.iterate<Record<string, unknown>, void>((value) => { if (value && typeof value === "object") logs.push(value); });
    return { logs };
}

async function applyDomain(domain: SyncDomain, data: unknown) {
    applying = true;
    try {
        const value = (data || {}) as Record<string, any>;
        if (domain === "canvas" && Array.isArray(value.projects)) useCanvasStore.getState().replaceProjects(value.projects);
        else if (domain === "assets" && Array.isArray(value.assets)) useAssetStore.getState().replaceAssets(await Promise.all(value.assets.map(hydrateAsset)));
        else if (domain === "config" && value.config) useConfigStore.setState({ config: { ...defaultConfig, ...value.config } });
        else if (domain === "prompt-sources" && Array.isArray(value.sources)) usePromptSourceStore.setState({ sources: value.sources, schedule: value.schedule || usePromptSourceStore.getState().schedule });
        else if (domain === "plugins" && Array.isArray(value.plugins)) usePluginStore.setState({ plugins: value.plugins });
        else if (domain === "theme" && (value.theme === "light" || value.theme === "dark")) useThemeStore.setState({ theme: value.theme });
        else if ((domain === "image-workbench" || domain === "video-workbench") && Array.isArray(value.logs)) {
            const store = domain === "image-workbench" ? imageLogStore : videoLogStore;
            await store.clear();
            await Promise.all(value.logs.map((item: Record<string, unknown>) => typeof item.id === "string" ? store.setItem(item.id, item) : undefined));
        }
    } finally { applying = false; }
}

async function hydrateAsset(asset: any) {
    if (asset?.kind === "image" && asset.data?.storageKey) {
        const dataUrl = await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl || "");
        return { ...asset, coverUrl: asset.coverUrl?.startsWith("blob:") ? dataUrl : asset.coverUrl, data: { ...asset.data, dataUrl } };
    }
    if (asset?.kind === "video" && asset.data?.storageKey) {
        const url = await resolveMediaUrl(asset.data.storageKey, asset.data.url || "");
        return { ...asset, coverUrl: asset.coverUrl?.startsWith("blob:") ? url : asset.coverUrl, data: { ...asset.data, url } };
    }
    return asset;
}

async function clearLocalAccountState() {
    useCanvasStore.getState().replaceProjects([]);
    useAssetStore.getState().replaceAssets([]);
    useConfigStore.setState({ config: defaultConfig });
    usePromptSourceStore.setState({ sources: DEFAULT_PROMPT_SOURCES, schedule: usePromptSourceStore.getState().schedule });
    usePluginStore.setState({ plugins: [] });
    useThemeStore.setState({ theme: "dark" });
    await Promise.all([imageLogStore.clear(), videoLogStore.clear()]);
}

function emptyDomain(domain: SyncDomain): unknown {
    if (domain === "canvas") return { projects: [] };
    if (domain === "assets") return { assets: [] };
    if (domain === "config") return { config: defaultConfig };
    if (domain === "prompt-sources") return { sources: DEFAULT_PROMPT_SOURCES, schedule: usePromptSourceStore.getState().schedule };
    if (domain === "plugins") return { plugins: [] };
    if (domain === "theme") return { theme: "dark" };
    return { logs: [] };
}

export function mergeRemoteDomainData(domain: SyncDomain, local: unknown, remote: SyncDomainResponse, canMigrate: boolean) {
    if (remote.version <= 0 || remote.data == null) return null;
    // Configuration is a singleton document, so an existing server snapshot is authoritative on login.
    if (domain === "config") return mergeDomainPayload({}, remote.data, remote.tombstones || []);
    const mergeBase = canMigrate ? emptyDomain(domain) : local;
    return mergeDomainPayload(mergeBase, remote.data, remote.tombstones || []);
}

function mergeDomainPayload(local: unknown, remote: unknown, tombstones: SyncTombstone[]) {
    const localObject = (local || {}) as Record<string, unknown>;
    const remoteObject = (remote || {}) as Record<string, unknown>;
    const result: Record<string, unknown> = { ...remoteObject, ...localObject };
    const mergedTombstones = mergeSyncRecords([], [], [...tombstones, ...extractTombstones(local), ...extractTombstones(remote)]).tombstones;
    for (const key of new Set([...Object.keys(localObject), ...Object.keys(remoteObject)])) {
        if (key === SYNC_TOMBSTONES_FIELD) continue;
        const left = Array.isArray(localObject[key]) ? localObject[key] : null;
        const right = Array.isArray(remoteObject[key]) ? remoteObject[key] : null;
        if (left && right && left.every((item) => item && typeof item === "object" && "id" in item) && right.every((item) => item && typeof item === "object" && "id" in item)) result[key] = mergeSyncRecords(left as Array<Record<string, unknown>>, right as Array<Record<string, unknown>>, tombstones).records;
    }
    result[SYNC_TOMBSTONES_FIELD] = mergedTombstones;
    return { data: result, tombstones: mergedTombstones };
}

function mergeConfigPayload(base: unknown, local: unknown, remote: unknown, tombstones: SyncTombstone[]) {
    if (!isRecord(base) || !isRecord(local) || !isRecord(remote)) return mergeDomainPayload(local, remote, tombstones);
    const remotePayload = mergeDomainPayload({}, remote, tombstones);
    const result = { ...((remotePayload.data || {}) as Record<string, unknown>) };
    for (const [key, localValue] of Object.entries(local)) {
        const baseValue = base[key];
        if (key === "config" && isRecord(localValue) && isRecord(baseValue) && isRecord(remotePayload.data) && isRecord(remotePayload.data.config)) {
            const config = { ...(remotePayload.data.config as Record<string, unknown>) };
            for (const [configKey, value] of Object.entries(localValue)) {
                if (JSON.stringify(value) !== JSON.stringify(baseValue[configKey])) config[configKey] = value;
            }
            result.config = config;
        } else if (JSON.stringify(localValue) !== JSON.stringify(baseValue)) {
            result[key] = localValue;
        }
    }
    return { data: result, tombstones: remotePayload.tombstones };
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeResponse(body: any, domain?: SyncDomain): SyncDomainResponse {
    const conflict = body?.error?.details;
    const stateDocument = conflict?.domains && domain ? conflict.domains[domain] : null;
    const value = stateDocument || (conflict && typeof conflict === "object" && "version" in conflict ? conflict : body?.data && typeof body.data === "object" && "version" in body.data ? body.data : body);
    const rawFiles = Array.isArray(value?.files) ? value.files : Array.isArray(conflict?.files) ? conflict.files : [];
    const files = rawFiles.map((file: any) => ({ storageKey: String(file.storageKey || ""), bytes: Number(file.bytes ?? file.size ?? 0), mimeType: String(file.mimeType || file.contentType || "application/octet-stream") }));
    return { version: Number(value?.version || 0), data: value?.data ?? null, files, tombstones: Array.isArray(value?.tombstones) ? value.tombstones : [] };
}

async function readJson(response: Response) {
    try { return await response.json(); } catch { return {}; }
}

function hasDomainData(data: unknown) {
    if (!data || typeof data !== "object") return false;
    return Object.values(data).some((value) => Array.isArray(value) ? value.length > 0 : value && typeof value === "object" ? Object.keys(value).length > 0 : Boolean(value));
}

function timeOf(value: unknown) {
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value) || 0;
    return 0;
}

function waitForHydration(signal?: AbortSignal) {
    const stores = [useCanvasStore, useAssetStore];
    return Promise.all(stores.map((store) => store.getState().hydrated ? Promise.resolve() : new Promise<void>((resolve, reject) => {
        const unsubscribe = store.subscribe((state) => {
            if (!state.hydrated) return;
            unsubscribe();
            signal?.removeEventListener("abort", abort);
            resolve();
        });
        const abort = () => {
            unsubscribe();
            reject(signal?.reason instanceof Error ? signal.reason : new Error(SYNC_ROUND_TIMEOUT_MESSAGE));
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
    })));
}

function throwIfSyncAborted(signal: AbortSignal) {
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error(SYNC_ROUND_TIMEOUT_MESSAGE);
}

export async function downloadSyncFile(storageKey: string) {
    const blob = await syncFile(storageKey);
    if (!blob) return null;
    if (storageKey.startsWith("image:")) await setImageBlob(storageKey, blob);
    else await setMediaBlob(storageKey, blob);
    return blob;
}

export async function uploadSyncFile(storageKey: string) {
    const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
    if (blob) await syncFile(storageKey, blob, blob.type);
}
