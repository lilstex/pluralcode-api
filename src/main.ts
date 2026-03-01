import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
    .addServer('http://localhost:2200/', 'Local environment')
    .addServer('https://plrcap-norcap-api.example.com/', 'Production')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);
  await app.listen(process.env.PORT ?? 2200);
}
bootstrap();
