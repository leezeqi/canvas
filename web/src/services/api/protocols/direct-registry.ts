import type { DirectAIProvider } from "@/lib/model-channel";
import { arkDirectProtocol } from "./ark";
import type { DirectProtocolAdapter } from "./types";

export const directProtocolAdapters: Readonly<Record<DirectAIProvider, DirectProtocolAdapter>> = {
    ark: arkDirectProtocol,
};
