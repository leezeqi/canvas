import { describe, expect, it } from "vitest";

import { returnToFromSearch, safeReturnTo } from "@/lib/auth-navigation";

describe("safeReturnTo", () => {
    it.each([
        [null, "/"],
        ["", "/"],
        ["https://evil.example/steal", "/"],
        ["//evil.example/steal", "/"],
        ["/\\evil.example/steal", "/"],
        ["/login", "/"],
        ["/auth/hajimi/callback#ticket=secret", "/"],
    ])("rejects unsafe or recursive destinations", (value, expected) => {
        expect(safeReturnTo(value)).toBe(expected);
    });

    it.each(["/canvas", "/canvas/project-1?mode=edit#node-2", "/assets?type=image"])('keeps same-origin path "%s"', (value) => {
        expect(safeReturnTo(value)).toBe(value);
    });

    it("uses the caller fallback when the destination is unsafe", () => {
        expect(safeReturnTo("https://evil.example", "/canvas")).toBe("/canvas");
    });
});

describe("returnToFromSearch", () => {
    it("decodes a valid returnTo parameter", () => {
        expect(returnToFromSearch("?returnTo=%2Fcanvas%2Fproject-1%3Fmode%3Dedit%23node-2")).toBe("/canvas/project-1?mode=edit#node-2");
    });

    it("does not turn an encoded external URL into an open redirect", () => {
        expect(returnToFromSearch("?returnTo=https%3A%2F%2Fevil.example%2Fsteal")).toBe("/");
    });
});
