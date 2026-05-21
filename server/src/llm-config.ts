/**
 * LLM 配置由 syncer 在 bootstrap 阶段注入到 pod env：
 *   A3S_LLM_PROVIDER   provider name (我们目前只支持 'anthropic')
 *   A3S_LLM_MODEL_ID   model id, e.g. claude-opus-4-7
 *   A3S_LLM_BASE_URL   可选，默认走 https://api.anthropic.com
 *   A3S_LLM_API_KEY    必填
 *
 * 未配置时 server 仍能起，但 /api/research/stream 会返回 503。
 */

export interface LlmConfig {
    provider: string;
    modelId: string;
    apiKey: string;
    baseUrl?: string;
}

export function loadLlmConfig(): LlmConfig | null {
    const provider = (process.env.A3S_LLM_PROVIDER || '').trim().toLowerCase();
    const modelId = (process.env.A3S_LLM_MODEL_ID || '').trim();
    const apiKey = (process.env.A3S_LLM_API_KEY || '').trim();
    const baseUrl = (process.env.A3S_LLM_BASE_URL || '').trim();
    if (!provider || !modelId || !apiKey) return null;
    return { provider, modelId, apiKey, baseUrl: baseUrl || undefined };
}

export function describeMissingConfig(): string {
    const missing: string[] = [];
    if (!process.env.A3S_LLM_PROVIDER) missing.push('A3S_LLM_PROVIDER');
    if (!process.env.A3S_LLM_MODEL_ID) missing.push('A3S_LLM_MODEL_ID');
    if (!process.env.A3S_LLM_API_KEY) missing.push('A3S_LLM_API_KEY');
    return missing.length > 0
        ? `Missing env: ${missing.join(', ')}. 在 书安OS「设置 → AI」配置默认模型后重新 install/upgrade chart 即可。`
        : '';
}
