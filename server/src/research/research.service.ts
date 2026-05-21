import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { describeMissingConfig, loadLlmConfig, LlmConfig } from '../llm-config';
import { streamOpenAICompatible } from './openai-stream';
import type { ResearchEvent } from './research.types';

const SYSTEM_PROMPT =
    '你是深度研究助手。收到研究问题时，按"分解 → 检索 → 交叉验证 → 总结"四步推进，' +
    '每个结论都给出来源链接。回答用中文，但代码标识符和参考文献链接保持英文/原文。' +
    '回答以 Markdown 输出，长度适中，避免空话。';

@Injectable()
export class ResearchService {
    private readonly logger = new Logger(ResearchService.name);

    isReady(): boolean {
        return loadLlmConfig() !== null;
    }

    statusMessage(): string {
        return describeMissingConfig();
    }

    /**
     * Run a research question against the configured Claude model with the
     * built-in web_search tool enabled. Yields SSE-ready events; callers (the
     * controller) serialize them with `event:` + `data:` framing.
     */
    async *streamResearch(question: string): AsyncGenerator<ResearchEvent> {
        const config = loadLlmConfig();
        if (!config) {
            yield { type: 'error', message: describeMissingConfig() };
            return;
        }

        if (config.provider === 'anthropic') {
            yield* this.streamWithAnthropic(question, config);
            return;
        }
        // Any other provider name (openai, openai-compatible, deepseek...) goes
        // through the generic OpenAI chat-completions path. Web search is not
        // available there — Anthropic's hosted web_search tool is provider-bound.
        yield* streamOpenAICompatible(config, question, SYSTEM_PROMPT);
    }

    private async *streamWithAnthropic(
        question: string,
        config: LlmConfig,
    ): AsyncGenerator<ResearchEvent> {
        const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
        yield { type: 'start', model: config.modelId, provider: config.provider };

        try {
            const stream = client.messages.stream({
                model: config.modelId,
                max_tokens: 4096,
                system: SYSTEM_PROMPT,
                tools: [
                    {
                        type: 'web_search_20250305',
                        name: 'web_search',
                        max_uses: 6,
                    } as unknown as Anthropic.Tool,
                ],
                messages: [{ role: 'user', content: question }],
            });

            for await (const event of stream) {
                const mapped = mapAnthropicEvent(event);
                for (const item of mapped) yield item;
            }

            const finalMessage = await stream.finalMessage();
            for (const item of extractCitationsAndUsage(finalMessage)) {
                yield item;
            }
            yield { type: 'done' };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Claude stream failed: ${message}`);
            yield { type: 'error', message };
        }
    }
}

/**
 * Translate Anthropic stream events into our flatter ResearchEvent union.
 * Most semantic info is in `content_block_*` events. We cast through `unknown`
 * because the SDK's content_block union does not yet include the newer
 * `server_tool_use` and `thinking_delta` variants we rely on for web_search.
 */
function mapAnthropicEvent(event: Anthropic.MessageStreamEvent): ResearchEvent[] {
    if (event.type === 'content_block_start') {
        const block = event.content_block as unknown as {
            type: string;
            name?: string;
            input?: { query?: string };
        };
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
            return [{ type: 'tool_use', tool: 'web_search', query: String(block.input?.query ?? '') }];
        }
        return [];
    }
    if (event.type === 'content_block_delta') {
        const delta = event.delta as unknown as { type: string; text?: string; thinking?: string };
        if (delta.type === 'text_delta' && delta.text != null) {
            return [{ type: 'text_delta', text: delta.text }];
        }
        if (delta.type === 'thinking_delta' && delta.thinking != null) {
            return [{ type: 'thinking_delta', text: delta.thinking }];
        }
    }
    return [];
}

interface RawCitation {
    type?: string;
    url?: string;
    title?: string;
    cited_text?: string;
}

function extractCitationsAndUsage(message: Anthropic.Message): ResearchEvent[] {
    const out: ResearchEvent[] = [];
    let webSearchResultCount = 0;
    for (const block of message.content ?? []) {
        if ((block as { type?: string }).type === 'web_search_tool_result') {
            const content = (block as { content?: unknown[] }).content ?? [];
            webSearchResultCount += Array.isArray(content) ? content.length : 0;
        }
        if ((block as { type?: string }).type === 'text') {
            const citations = (block as { citations?: RawCitation[] }).citations ?? [];
            for (const citation of citations) {
                if (citation.type === 'web_search_result_location' && citation.url) {
                    out.push({
                        type: 'citation',
                        url: citation.url,
                        title: citation.title ?? citation.url,
                        citedText: citation.cited_text ?? '',
                    });
                }
            }
        }
    }
    if (webSearchResultCount > 0) {
        out.push({ type: 'tool_result', tool: 'web_search', resultCount: webSearchResultCount });
    }
    if (message.usage) {
        out.push({
            type: 'usage',
            inputTokens: message.usage.input_tokens ?? 0,
            outputTokens: message.usage.output_tokens ?? 0,
        });
    }
    return out;
}
