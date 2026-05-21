import { BadRequestException, Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ResearchService } from './research.service';
import type { ResearchEvent, ResearchRequestBody } from './research.types';

@Controller('research')
export class ResearchController {
    constructor(private readonly research: ResearchService) {}

    @Get('status')
    status() {
        const ready = this.research.isReady();
        return {
            ready,
            message: ready ? '已就绪' : this.research.statusMessage(),
        };
    }

    /**
     * SSE 流式接口。每条事件按 `event: <type>` + `data: <json>` 输出，
     * SPA 端用 fetch + ReadableStream 解析（EventSource 不让带 body）。
     */
    @Post('stream')
    async stream(@Body() body: ResearchRequestBody, @Res() res: Response): Promise<void> {
        const question = (body?.question ?? '').trim();
        if (!question) throw new BadRequestException('question 不能为空');

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // 防止 nginx 缓冲
        res.flushHeaders?.();

        const writeEvent = (event: ResearchEvent) => {
            res.write(`event: ${event.type}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        let aborted = false;
        res.on('close', () => {
            aborted = true;
        });

        try {
            for await (const event of this.research.streamResearch(question)) {
                if (aborted) break;
                writeEvent(event);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            writeEvent({ type: 'error', message });
        } finally {
            res.end();
        }
    }
}
