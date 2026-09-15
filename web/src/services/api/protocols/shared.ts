export function readDirectError(payload: unknown) {
    const code = readNumber(readPath(payload, "code"));
    const explicitError = firstString(readPath(payload, "error.message"), readPath(payload, "data.error.message"), readPath(payload, "data.failMsg"), readPath(payload, "data.failCode"));
    if (explicitError) return explicitError;
    if (code !== undefined && code !== 0 && code !== 200) return firstString(readPath(payload, "msg"), readPath(payload, "message"), `上游请求失败：${code}`);
    return "";
}

export function normalizeDirectStatus(value: string) {
    switch (value.trim().toLowerCase()) {
        case "success":
        case "succeeded":
        case "completed":
            return "completed";
        case "fail":
        case "failed":
        case "cancelled":
        case "canceled":
            return "failed";
        default:
            return "processing";
    }
}

export function readPath(value: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((current, key) => {
        if (Array.isArray(current)) return current[Number(key)];
        return isPlainRecord(current) ? current[key] : undefined;
    }, value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export function readNumber(value: unknown) {
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    return Number.isFinite(number) ? number : undefined;
}

export function firstString(...values: unknown[]) {
    for (const value of values) {
        const text = readString(value);
        if (text) return text;
    }
    return "";
}
