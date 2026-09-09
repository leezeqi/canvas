// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChannelEditorDrawer } from "@/components/layout/channel-editor-drawer";
import type { ModelChannel } from "@/stores/use-config-store";
import "@/i18n";

vi.mock("./model-select-modal", () => ({ ModelSelectModal: () => null }));
vi.mock("./model-script-editor", () => ({ ModelScriptEditor: () => null }));

beforeEach(() => {
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const channel: ModelChannel = { id: "channel-a", name: "Channel A", apiFormat: "openai", baseUrl: "https://saved.example.com", apiKey: "saved-key", models: [] };
const edited = { baseUrl: "https://edited.example.com", apiKey: "edited-key" };

function editCredentials() {
    fireEvent.change(screen.getByPlaceholderText("https://api.example.com"), { target: { value: edited.baseUrl } });
    fireEvent.change(screen.getByPlaceholderText("sk-..."), { target: { value: edited.apiKey } });
}

function expectCredentials(value: { baseUrl: string; apiKey: string }) {
    expect((screen.getByPlaceholderText("https://api.example.com") as HTMLInputElement).value).toBe(value.baseUrl);
    expect((screen.getByPlaceholderText("sk-...") as HTMLInputElement).value).toBe(value.apiKey);
}

describe("ChannelEditorDrawer", () => {
    it("keeps unsaved credentials when synchronization replaces the same channel", () => {
        const props = { open: true, channel, onSave: vi.fn(), onClose: vi.fn() };
        const { rerender } = render(<ChannelEditorDrawer {...props} />);
        editCredentials();

        rerender(<ChannelEditorDrawer {...props} channel={{ ...channel }} />);
        expectCredentials(edited);
        expect(props.onSave).not.toHaveBeenCalled();
    });

    it("discards cancelled edits and initializes from the latest channel when reopened", () => {
        const props = { open: true, channel, onSave: vi.fn(), onClose: vi.fn() };
        const { rerender } = render(<ChannelEditorDrawer {...props} />);
        editCredentials();
        fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));

        expect(props.onClose).toHaveBeenCalledOnce();
        expect(props.onSave).not.toHaveBeenCalled();
        const latest = { ...channel, baseUrl: "https://latest.example.com", apiKey: "latest-key" };
        rerender(<ChannelEditorDrawer {...props} open={false} channel={latest} />);
        rerender(<ChannelEditorDrawer {...props} channel={latest} />);
        expectCredentials(latest);
    });

    it("initializes a different channel without carrying over unsaved credentials", () => {
        const props = { open: true, channel, onSave: vi.fn(), onClose: vi.fn() };
        const { rerender } = render(<ChannelEditorDrawer {...props} />);
        editCredentials();

        const other = { ...channel, id: "channel-b", baseUrl: "https://other.example.com", apiKey: "other-key" };
        rerender(<ChannelEditorDrawer {...props} channel={other} />);
        expectCredentials(other);
        rerender(<ChannelEditorDrawer {...props} />);
        expectCredentials(channel);
    });

    it("saves the edited credentials once after a synchronization update", () => {
        const props = { open: true, channel, onSave: vi.fn(), onClose: vi.fn() };
        const { rerender } = render(<ChannelEditorDrawer {...props} />);
        editCredentials();
        rerender(<ChannelEditorDrawer {...props} channel={{ ...channel, apiKey: "synced-key" }} />);

        fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));

        expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ ...channel, ...edited });
        expect(props.onClose).toHaveBeenCalledOnce();
        const saved = props.onSave.mock.calls[0][0] as ModelChannel;
        rerender(<ChannelEditorDrawer {...props} open={false} channel={saved} />);
        rerender(<ChannelEditorDrawer {...props} channel={saved} />);
        expectCredentials(edited);
    });
});
