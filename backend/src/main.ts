import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

// GameEvent.id is a BigInt (auto-increment PK). JSON.stringify can't handle BigInt
// natively, so we patch the prototype here — once, at startup.
// Serialized as a string to preserve precision (JS numbers lose precision > 2^53).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse cookies so guards can read the session cookie.
  app.use(cookieParser());

  // Global DTO validation.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Backend listening on port ${port}`);
}
bootstrap();
