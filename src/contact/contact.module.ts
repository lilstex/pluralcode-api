import { Module } from '@nestjs/common';
import { ContactController } from './controller/contact.controller';
import { ContactService } from './service/contact.service';
import { EmailModule } from 'src/providers/email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
