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
