import { Module } from '@nestjs/common';
import { OdaController } from './controller/oda.controller';
import { OdaStructureService } from './service/oda-structure.service';
import { OdaAssessmentService } from './service/oda-assessment.service';
import { OdaScoringService } from './service/oda-scoring.service';
import { PrismaService } from 'src/prisma.service';
import { EmailModule } from 'src/providers/email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [OdaController],
  providers: [
    OdaStructureService,
    OdaAssessmentService,
    OdaScoringService,
    PrismaService,
  ],
  exports: [OdaAssessmentService],
})
export class OdaModule {}
