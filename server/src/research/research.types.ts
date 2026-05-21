/**
 * SSE event payloads sent to /api/research/stream subscribers.
 * 与 SPA 共享形状（SPA 端有同样的 union 类型）。
 */

export type ResearchEvent =
    | { type: 'start'; model: string; provider: string }
    | { type: 'thinking_delta'; text: string }
    | { type: 'text_delta'; text: string }
    | { type: 'tool_use'; tool: 'web_search'; query: string }
    | { type: 'tool_result'; tool: 'web_search'; resultCount: number }
    | { type: 'citation'; url: string; title: string; citedText: string }
    | { type: 'usage'; inputTokens: number; outputTokens: number }
    | { type: 'done' }
    | { type: 'error'; message: string };

export interface ResearchRequestBody {
    question: string;
}
