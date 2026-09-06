type PresenceResponse = {
    data: {
        online: number;
    };
};

export async function heartbeatPresence() {
    const response = await fetch("/api/presence/heartbeat", { method: "POST", credentials: "include" });
    if (!response.ok) throw new Error(`在线状态更新失败（HTTP ${response.status}）`);
    return ((await response.json()) as PresenceResponse).data;
}

export async function fetchOnlineUsers(signal?: AbortSignal): Promise<{ users: string[] }> {
    const response = await fetch("/api/presence/users", { credentials: "include", signal });
    if (!response.ok) throw new Error(`在线用户加载失败（HTTP ${response.status}）`);
    return (await response.json()).data;
}
