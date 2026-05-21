import type { ResearchEvent } from './types';

/**
 * Minimal SSE parser for the `event: <type>\ndata: <json>\n\n` stream produced
 * by the NestJS controller. We can't use EventSource because the endpoint is
 * POST + body.
 */
export async function* streamResearch(
    question: string,
    signal: AbortSignal,
): AsyncGenerator<ResearchEvent> {
    const response = await fetch('/api/research/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
        signal,
    });
    if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (const event of drainEvents(buffer.split(/\r?\n\r?\n/))) {
            yield event;
        }
        // Keep the trailing partial chunk.
        const lastSplit = buffer.lastIndexOf('\n\n');
        if (lastSplit !== -1) buffer = buffer.slice(lastSplit + 2);
    }
}

function* drainEvents(blocks: string[]): Generator<ResearchEvent> {
    for (const block of blocks.slice(0, -1)) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        const dataLine = trimmed.split(/\r?\n/).find(line => line.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload) continue;
        try {
            yield JSON.parse(payload) as ResearchEvent;
        } catch {
            // skip malformed event
        }
    }
}
