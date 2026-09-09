// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChannelEditorDrawer } from "@/components/layout/channel-editor-drawer";
import { ModelSelectModal } from "@/components/layout/model-select-modal";
import i18n from "@/i18n";
import { fetchChannelModels } from "@/services/api/image";
import type { ModelChannel } from "@/stores/use-config-store";

vi.mock("@/services/api/image", () => ({ fetchChannelModels: vi.fn() }));
vi.mock("./model-script-editor", () => ({ ModelScriptEditor: () => null }));

const channel: ModelChannel = { id: "channel-a", name: "Channel A", apiFormat: "openai", baseUrl: "https://example.com", apiKey: "test-key", models: [] };
const other = { ...channel, id: "channel-b", name: "Channel B" };
const props = { open: true, channel, selectedNames: [] as string[], onConfirm: vi.fn(), onClose: vi.fn() };
const fetchMock = vi.mocked(fetchChannelModels);

function Wrapper({ children }: { children: ReactNode }) {
    return <ConfigProvider theme={{ token: { motion: false } }}><App>{children}</App></ConfigProvider>;
}

function deferredModels() {
    let resolve!: (models: string[]) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<string[]>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    return { promise, resolve, reject };
}

const fetchButton = () => screen.getByRole("button", { name: /Fetch model list$/ });
const input = (placeholder: string) => screen.getByPlaceholderText(placeholder) as HTMLInputElement;

beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    void i18n.changeLanguage("en-US");
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    void i18n.changeLanguage("zh-CN");
});

describe("ModelSelectModal", () => {
    it("preserves fetched models, selection and inputs through drawer synchronization, then saves once", async () => {
        fetchMock.mockResolvedValue(["gpt-image-2", "gpt-text"]);
        const drawerProps = { open: true, channel, onSave: vi.fn(), onClose: vi.fn() };
        const { rerender } = render(<ChannelEditorDrawer {...drawerProps} />, { wrapper: Wrapper });
        fireEvent.click(screen.getByRole("button", { name: "Select models" }));
        fireEvent.click(fetchButton());
        fireEvent.click(await screen.findByRole("checkbox", { name: "gpt-image-2" }));
        fireEvent.change(input("Search models"), { target: { value: "image" } });
        fireEvent.change(input("Enter a model name"), { target: { value: "unfinished-model" } });

        rerender(<ChannelEditorDrawer {...drawerProps} channel={{ ...channel, models: [...channel.models] }} />);

        expect(input("Search models").value).toBe("image");
        expect(input("Enter a model name").value).toBe("unfinished-model");
        expect((screen.getByRole("checkbox", { name: "gpt-image-2" }) as HTMLInputElement).checked).toBe(true);
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(channel);
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(drawerProps.onSave).toHaveBeenCalledExactlyOnceWith({ ...channel, models: [{ name: "gpt-image-2", capability: "image" }] });
        expect(drawerProps.onClose).toHaveBeenCalledOnce();
    });

    it("initializes reopened selection from the latest saved models and discards cancelled input", async () => {
        fetchMock.mockResolvedValue(["old-model"]);
        const { rerender } = render(<ModelSelectModal {...props} />, { wrapper: Wrapper });
        fireEvent.click(fetchButton());
        fireEvent.click(await screen.findByRole("checkbox", { name: "old-model" }));
        fireEvent.change(input("Search models"), { target: { value: "old" } });
        fireEvent.change(input("Enter a model name"), { target: { value: "unfinished" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(props.onClose).toHaveBeenCalledOnce();
        expect(props.onConfirm).not.toHaveBeenCalled();
        rerender(<ModelSelectModal {...props} open={false} />);
        rerender(<ModelSelectModal {...props} selectedNames={["saved-model"]} />);

        expect(input("Search models").value).toBe("");
        expect(input("Enter a model name").value).toBe("");
        expect(screen.queryByRole("checkbox", { name: "old-model" })).toBeNull();
        expect((screen.getByRole("checkbox", { name: "saved-model" }) as HTMLInputElement).checked).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith(["saved-model"]);
    });

    it("clears fetched models and draft input when switching channels with the same selected names", async () => {
        fetchMock.mockResolvedValue(["old-model"]);
        const { rerender } = render(<ModelSelectModal {...props} />, { wrapper: Wrapper });
        fireEvent.click(fetchButton());
        fireEvent.click(await screen.findByRole("checkbox", { name: "old-model" }));
        fireEvent.change(input("Search models"), { target: { value: "old" } });
        fireEvent.change(input("Enter a model name"), { target: { value: "unfinished" } });

        rerender(<ModelSelectModal {...props} channel={other} />);

        expect(screen.queryByRole("checkbox", { name: "old-model" })).toBeNull();
        expect(input("Search models").value).toBe("");
        expect(input("Enter a model name").value).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith([]);
    });

    it.each(["reopen", "switch"])("ignores stale successful requests after %s without ending the new request", async (transition) => {
        const stale = deferredModels();
        const fresh = deferredModels();
        fetchMock.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
        const { rerender } = render(<ModelSelectModal {...props} />, { wrapper: Wrapper });
        fireEvent.click(fetchButton());
        if (transition === "reopen") rerender(<ModelSelectModal {...props} open={false} />);
        rerender(<ModelSelectModal {...props} channel={transition === "switch" ? other : channel} />);
        fireEvent.click(fetchButton());
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await act(async () => stale.resolve(["stale-model"]));
        expect(screen.queryByRole("checkbox", { name: "stale-model" })).toBeNull();
        expect(screen.queryByText("Fetched 1 models")).toBeNull();
        fireEvent.click(fetchButton());
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await act(async () => fresh.resolve(["fresh-model"]));
        expect(screen.getByRole("checkbox", { name: "fresh-model" })).toBeTruthy();
    });

    it.each(["reopen", "switch"])("ignores stale request errors after %s", async (transition) => {
        const stale = deferredModels();
        fetchMock.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(["fresh-model"]);
        const { rerender } = render(<ModelSelectModal {...props} />, { wrapper: Wrapper });
        fireEvent.click(fetchButton());
        if (transition === "reopen") rerender(<ModelSelectModal {...props} open={false} />);
        rerender(<ModelSelectModal {...props} channel={transition === "switch" ? other : channel} />);

        await act(async () => stale.reject(new Error("Obsolete request failed")));
        expect(screen.queryByText("Obsolete request failed")).toBeNull();
        fireEvent.click(fetchButton());
        expect(await screen.findByRole("checkbox", { name: "fresh-model" })).toBeTruthy();
    });
});
