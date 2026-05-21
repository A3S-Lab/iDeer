// 与 server/src/research/research.types.ts 同构（如有改动两边一起改）。
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

export interface ResearchTrace {
    model: string;
    provider: string;
    thinking: string;
    answer: string;
    webSearches: Array<{ query: string; resultCount?: number }>;
    citations: Array<{ url: string; title: string; citedText: string }>;
    usage?: { inputTokens: number; outputTokens: number };
    done: boolean;
    error: string | null;
}

export function emptyTrace(): ResearchTrace {
    return {
        model: '',
        provider: '',
        thinking: '',
        answer: '',
        webSearches: [],
        citations: [],
        usage: undefined,
        done: false,
        error: null,
    };
}

export function applyEvent(trace: ResearchTrace, event: ResearchEvent): ResearchTrace {
    switch (event.type) {
        case 'start':
            return { ...trace, model: event.model, provider: event.provider };
        case 'thinking_delta':
            return { ...trace, thinking: trace.thinking + event.text };
        case 'text_delta':
            return { ...trace, answer: trace.answer + event.text };
        case 'tool_use':
            return {
                ...trace,
                webSearches: [...trace.webSearches, { query: event.query }],
            };
        case 'tool_result': {
            // Attach the count to the last web_search lacking one.
            const next = [...trace.webSearches];
            for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].resultCount === undefined) {
                    next[i] = { ...next[i], resultCount: event.resultCount };
                    break;
                }
            }
            return { ...trace, webSearches: next };
        }
        case 'citation':
            return {
                ...trace,
                citations: [
                    ...trace.citations,
                    { url: event.url, title: event.title, citedText: event.citedText },
                ],
            };
        case 'usage':
            return { ...trace, usage: { inputTokens: event.inputTokens, outputTokens: event.outputTokens } };
        case 'done':
            return { ...trace, done: true };
        case 'error':
            return { ...trace, error: event.message, done: true };
        default:
            return trace;
    }
}
