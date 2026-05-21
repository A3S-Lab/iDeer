import type { LlmConfig } from '../llm-config';
import type { ResearchEvent } from './research.types';

interface ChatChunkDelta {
    content?: string;
    reasoning_content?: string;
    role?: string;
}

interface ChatChunkChoice {
    index: number;
    delta: ChatChunkDelta;
    finish_reason: string | null;
}

interface ChatUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
}

interface ChatChunk {
    choices: ChatChunkChoice[];
    usage?: ChatUsage;
}

/**
 * Stream from any OpenAI-compatible chat completion endpoint. No web_search —
 * this path degrades gracefully when the configured provider is not Anthropic.
 */
export async function* streamOpenAICompatible(
    config: LlmConfig,
    question: string,
    systemPrompt: string,
): AsyncGenerator<ResearchEvent> {
    if (!config.baseUrl) {
        yield {
            type: 'error',
            message: `provider="${config.provider}" 缺少 baseUrl，无法发起请求`,
        };
        return;
    }

    const url = joinUrl(config.baseUrl, 'chat/completions');
    yield { type: 'start', model: config.modelId, provider: config.provider };

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.modelId,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question },
                ],
                stream: true,
                stream_options: { include_usage: true },
            }),
        });
    } catch (err) {
        yield { type: 'error', message: err instanceof Error ? err.message : String(err) };
        return;
    }

    if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '');
        yield {
            type: 'error',
            message: `HTTP ${response.status}: ${text.slice(0, 200) || response.statusText}`,
        };
        return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let usage: ChatUsage | undefined;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf('\n');
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let chunk: ChatChunk;
            try {
                chunk = JSON.parse(payload);
            } catch {
                continue;
            }
            if (chunk.usage) usage = chunk.usage;
            for (const choice of chunk.choices ?? []) {
                const delta = choice.delta ?? {};
                if (delta.reasoning_content) {
                    yield { type: 'thinking_delta', text: delta.reasoning_content };
                }
                if (delta.content) {
                    yield { type: 'text_delta', text: delta.content };
                }
            }
        }
    }

    if (usage) {
        yield {
            type: 'usage',
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
        };
    }
    yield { type: 'done' };
}

function joinUrl(base: string, path: string): string {
    const trimmedBase = base.replace(/\/+$/, '');
    const trimmedPath = path.replace(/^\/+/, '');
    return `${trimmedBase}/${trimmedPath}`;
}
