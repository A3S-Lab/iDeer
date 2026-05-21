import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', agent: 'deep-research', version: '0.1.4' };
  }
}
