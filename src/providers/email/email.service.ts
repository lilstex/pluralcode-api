import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as path from 'path';
import * as ejs from 'ejs';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly viewsPath: string;
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    this.viewsPath = path.join(__dirname, '../../../views');
    this.fromAddress =
      this.config.get<string>('EMAIL_FROM') ??
      'PLRCAP Hub <noreply@plrcap.org>';

    const options: SMTPTransport.Options = {
      host: this.config.get<string>('MAIL_HOST'),
      port: parseInt(this.config.get<string>('MAIL_PORT') ?? '465', 10),
      secure: this.config.get<string>('MAIL_PORT') === '465',
      auth: {
        user: this.config.get<string>('MAIL_USERNAME'),
        pass: this.config.get<string>('MAIL_PASSWORD'),
      },
    };

    this.transporter = nodemailer.createTransport(options);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async renderTemplate(
    template: string,
    data: Record<string, any>,
  ): Promise<string> {
    try {
      return await ejs.renderFile(
        path.join(this.viewsPath, `${template}.ejs`),
        data,
      );
    } catch (error) {
      this.logger.error(`Failed to render template: ${template}`, error);
      throw new InternalServerErrorException('Email template render error.');
    }
  }

  private async send(
    options: SendEmailOptions,
  ): Promise<{ status: boolean; message: string }> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to}: ${info.messageId}`);
      return { status: true, message: 'Email sent successfully.' };
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error);
      return { status: false, message: 'Failed to send email.' };
    }
  }

  // ─── Public Methods ───────────────────────────────────────────────────────────

  /**
   * Send OTP for email verification (new sign-ups).
   */
  async sendVerificationOtp(params: {
    fullName: string;
    email: string;
    otp: string;
  }) {
    const html = await this.renderTemplate('verification', params);
    return this.send({
      to: params.email,
      subject: 'Verify Your PLRCAP Hub Account',
      html,
    });
  }

  /**
   * Send welcome email after admin approves account.
   */
  async sendWelcomeEmail(params: {
    fullName: string;
    email: string;
    loginUrl: string;
  }) {
    const html = await this.renderTemplate('welcome', params);
    return this.send({
      to: params.email,
      subject: 'Welcome to the PLRCAP NGO Support Hub!',
      html,
    });
  }

  /**
   * Notify admin of a new pending registration.
   */
  async sendAdminApprovalNotification(params: {
    adminEmail: string;
    applicantName: string;
    applicantEmail: string;
    role: string;
    adminDashboardUrl: string;
  }) {
    const html = await this.renderTemplate('admin-approval', params);
    return this.send({
      to: params.adminEmail,
      subject: `New Registration Pending Approval — ${params.applicantName}`,
      html,
    });
  }

  /**
   * Send OTP for forgot-password flow.
   */
  async sendPasswordResetOtp(params: {
    fullName: string;
    email: string;
    otp: string;
  }) {
    const html = await this.renderTemplate('reset-password', params);
    return this.send({
      to: params.email,
      subject: 'Your PLRCAP Hub Password Reset OTP',
      html,
    });
  }

  /**
   * Notify user their account has been approved/rejected.
   */
  async sendAccountStatusNotification(params: {
    fullName: string;
    email: string;
    status: 'APPROVED' | 'REJECTED';
    reason?: string;
  }) {
    const template =
      params.status === 'APPROVED' ? 'account-approved' : 'account-rejected';
    const html = await this.renderTemplate(template, params);
    return this.send({
      to: params.email,
      subject:
        params.status === 'APPROVED'
          ? 'Your PLRCAP Account Has Been Approved!'
          : 'Your PLRCAP Account Application Update',
      html,
    });
  }
}
