export const modelChannelProtocols = [
    { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com" },
    { value: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com" },
    { value: "grok2api", label: "Grok2API", baseUrl: "" },
    { value: "sub2api", label: "Sub2API（Grok 视频）", baseUrl: "https://sub2api.dk996.top" },
    { value: "metaso", label: "MiniMax & METASO", baseUrl: "https://metaso.cn/api/minimax", apiKeyUrl: "https://metaso.cn/minimax-h3/?s=tt" },
    { value: "ark", label: "火山方舟", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", directRequestPlan: true },
    { value: "jimeng", label: "即梦", baseUrl: "https://visual.volcengineapi.com" },
    { value: "mimo", label: "MiMo", baseUrl: "https://api.xiaomimimo.com", apiKeyUrl: "https://platform.xiaomimimo.com/?ref=JFZQR2" },
] as const;

export type ModelChannelProtocol = (typeof modelChannelProtocols)[number]["value"];
export type DirectAIProvider = Extract<(typeof modelChannelProtocols)[number], { directRequestPlan: true }>["value"];
const hiddenModelChannelProtocols: ReadonlySet<string> = new Set(["metaso"]);
export const modelChannelProtocolOptions = modelChannelProtocols.filter(({ value }) => !hiddenModelChannelProtocols.has(value)).map(({ value, label }) => ({ label, value }));
export const modelChannelDefaultBaseUrls = Object.fromEntries(modelChannelProtocols.map(({ value, baseUrl }) => [value, baseUrl])) as Record<ModelChannelProtocol, string>;
export const modelChannelApiKeyUrls = Object.fromEntries(modelChannelProtocols.flatMap((protocol) => "apiKeyUrl" in protocol ? [[protocol.value, protocol.apiKeyUrl]] : [])) as Partial<Record<ModelChannelProtocol, string>>;

const directRequestProviders: ReadonlySet<string> = new Set(modelChannelProtocols.flatMap((protocol) => "directRequestPlan" in protocol && protocol.directRequestPlan === true ? [protocol.value] : []));

export function directAIProviderForProtocol(protocol: string): DirectAIProvider | null {
    return directRequestProviders.has(protocol) ? protocol as DirectAIProvider : null;
}
