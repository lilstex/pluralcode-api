import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaService } from './prisma-module/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Graceful shutdown ────────────────────────────────────────────────────
  // Tell NestJS to listen for OS shutdown signals (SIGTERM, SIGINT).
  // Without this, the process exits immediately and Prisma never calls
  // $disconnect(), leaving connections open in the pool.
  app.enableShutdownHooks();

  // Ensure Prisma disconnects cleanly when the app closes
  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  app.setGlobalPrefix('api/v1/');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: '*',
  });

  const options = new DocumentBuilder()
    .setTitle('PLRCAP/NORCAP NGO API Service')
    .setDescription('PLRCAP/NORCAP NGO API Docs')
    .setVersion('1.0')
    .addServer('http://localhost:2200', 'Local environment')
    .addServer('https://pluralcode-api.onrender.com', 'Development')
    .addServer(
      'https://plrcap-backend.ambitiousground-313553a9.westeurope.azurecontainerapps.io',
      'Production',
    )
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);
  await app.listen(process.env.PORT ?? 2200);
}
bootstrap();
