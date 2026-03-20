import * as path from 'node:path';
import * as dotenv from 'dotenv';
import * as bodyParser from 'body-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const bodyLimit = process.env.BODY_PARSER_LIMIT || '10mb';

  app.use(bodyParser.json({ limit: bodyLimit }));
  app.use(bodyParser.urlencoded({ extended: true, limit: bodyLimit }));

  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition', 'Content-Length'],
  });
  app.useGlobalPipes(GlobalValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 7871);

  try {
    await app.listen(port, host);
    console.log(`Server running on http://${host}:${port}`);
  } catch (error: any) {
    if (error?.code === 'EADDRINUSE') {
      console.error(
        `Port ${port} is already in use. Stop the existing process or set a different PORT in your .env.`,
      );
      process.exit(0);
      return;
    }
    throw error;
  }
}
bootstrap();
