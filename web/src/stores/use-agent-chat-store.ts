"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CanvasAgentProtocolMessage, CanvasAgentSkillSelection, CanvasAssistantReference } from "@/app/(user)/canvas/types";
import { localForageStorage } from "@/lib/localforage-storage";
import { fetchUserAgentSessions, syncUserAgentSessions } from "@/services/api/user-config";

export type AgentChatStatus = "running" | "success" | "error";
export type AgentChatMediaKind = "image" | "video" | "audio";
export type AgentChatMedia = { id: string; kind: AgentChatMediaKind; prompt: string; status: AgentChatStatus; url?: string; storageKey?: string; mimeType?: string; error?: string };
export type AgentChatStep = { id: string; label: string; status: AgentChatStatus; note?: boolean; startedAt: number; endedAt?: number };
export type AgentChatMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt?: number;
    feedback?: "up" | "down";
    status?: AgentChatStatus;
    references?: CanvasAssistantReference[];
    skills?: CanvasAgentSkillSelection[];
    steps?: AgentChatStep[];
    media?: AgentChatMedia[];
    startedAt?: number;
    endedAt?: number;
};
export type AgentChatSession = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: AgentChatMessage[];
    protocolMessages?: CanvasAgentProtocolMessage[];
    contextCheckpoint?: string;
};

type AgentChatStore = {
    sessions: AgentChatSession[];
    activeId: string | null;
    setActive: (id: string | null) => void;
    createSession: (title: string) => string;
    updateSession: (id: string, update: (session: AgentChatSession) => AgentChatSession) => void;
    renameSession: (id: string, title: string) => void;
    removeSession: (id: string) => void;
    hydrateAccountSessions: (token: string) => Promise<void>;
    stopAccountSync: () => void;
};

let syncToken = "";
let hydrating = false;
let syncTimer: number | null = null;

export const useAgentChatStore = create<AgentChatStore>()(
    persist(
        (set, get) => {
            const commit = (sessions: AgentChatSession[], activeId = get().activeId) => {
                set({ sessions, activeId });
                scheduleSync(get);
            };
            return {
                sessions: [],
                activeId: null,
                setActive: (activeId) => set({ activeId }),
                createSession: (title) => {
                    const now = new Date().toISOString();
                    const session: AgentChatSession = { id: nanoid(), title, createdAt: now, updatedAt: now, messages: [], protocolMessages: [] };
                    commit([session, ...get().sessions], session.id);
                    return session.id;
                },
                updateSession: (id, update) => commit(get().sessions.map((session) => (session.id === id ? { ...update(session), updatedAt: new Date().toISOString() } : session))),
                renameSession: (id, title) => get().updateSession(id, (session) => ({ ...session, title })),
                removeSession: (id) => commit(get().sessions.filter((session) => session.id !== id), get().activeId === id ? null : get().activeId),
                hydrateAccountSessions: async (token) => {
                    syncToken = token;
                    hydrating = true;
                    try {
                        const remote = await fetchUserAgentSessions<{ sessions?: AgentChatSession[] }>(token);
                        const merged = new Map(get().sessions.map((session) => [session.id, session]));
                        (remote?.sessions || []).forEach((session) => {
                            const local = merged.get(session.id);
                            if (local && Date.parse(local.updatedAt) >= Date.parse(session.updatedAt)) return;
                            merged.set(session.id, { ...session, protocolMessages: rebuildProtocolMessages(session.messages) });
                        });
                        set({ sessions: [...merged.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)) });
                    } finally {
                        hydrating = false;
                    }
                    scheduleSync(get);
                },
                stopAccountSync: () => {
                    syncToken = "";
                    if (syncTimer) window.clearTimeout(syncTimer);
                    syncTimer = null;
                },
            };
        },
        {
            name: "infinite-canvas:agent_chat_store",
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ sessions: state.sessions, activeId: state.activeId }),
            onRehydrateStorage: () => (state) => {
                if (!state?.sessions.some((session) => session.messages.some((message) => message.status === "running"))) return;
                const stop = <T extends { status?: AgentChatStatus }>(item: T): T => (item.status === "running" ? { ...item, status: "error" } : item);
                useAgentChatStore.setState({
                    sessions: state.sessions.map((session) => ({
                        ...session,
                        messages: session.messages.map((message) => message.status === "running" ? { ...stop(message), text: message.text || "页面刷新，本轮已中断。", steps: message.steps?.map(stop), media: message.media?.map((media) => media.status === "running" ? { ...media, status: "error", error: "已中断" } : media) } : message),
                    })),
                });
            },
        },
    ),
);

function scheduleSync(get: () => AgentChatStore) {
    if (hydrating || !syncToken || typeof window === "undefined") return;
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
        // 云端只同步可见消息和媒体链接；协议上下文体积大且可能含 base64 图片，只留在本地。
        const sessions = get().sessions.map(({ protocolMessages: _, ...session }) => ({
            ...session,
            messages: session.messages.map((message) => ({
                ...message,
                references: message.references?.map((reference) => ({ ...reference, dataUrl: persistentUrl(reference.dataUrl), url: persistentUrl(reference.url) })),
                media: message.media?.map((media) => ({ ...media, url: persistentUrl(media.url) })),
            })),
        }));
        void syncUserAgentSessions(syncToken, { sessions }).catch(() => {});
    }, 800);
}

function persistentUrl(url?: string) {
    return url && !url.startsWith("blob:") && !url.startsWith("data:") ? url : undefined;
}

function rebuildProtocolMessages(messages: AgentChatMessage[]): CanvasAgentProtocolMessage[] {
    return messages.filter((message) => message.text.trim()).map((message) => ({ role: message.role, content: message.text }));
}
