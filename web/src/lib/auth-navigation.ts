export function safeReturnTo(value: string | null, fallback = "/") {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
    if (value === "/login" || value.startsWith("/auth/hajimi/callback")) return fallback;
    return value;
}

export function returnToFromSearch(search: string) {
    return safeReturnTo(new URLSearchParams(search).get("returnTo"));
}
