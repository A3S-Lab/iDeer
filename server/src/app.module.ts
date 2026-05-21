import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { ResearchController } from './research/research.controller';
import { ResearchService } from './research/research.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      // Container layout: /app/server/dist/main.js  +  /app/web/dist/index.html
      // __dirname = /app/server/dist → ../../web/dist = /app/web/dist
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/(.*)'],
    }),
  ],
  controllers: [AppController, ResearchController],
  providers: [ResearchService],
})
export class AppModule {}
