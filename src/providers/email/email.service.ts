import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as path from 'path';
import * as ejs from 'ejs';
import { ConfigService } from '@nestjs/config';
import { EmailClient } from '@azure/communication-email';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: {
    name: string;
    contentType: string;
    contentInBase64: string;
  }[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly viewsPath: string;
  private readonly fromAddress: string;
  private readonly client: EmailClient;

  constructor(private readonly config: ConfigService) {
    this.viewsPath = path.join(__dirname, '../../../views');

    this.fromAddress =
      this.config.get<string>('AZURE_EMAIL_FROM') ??
      'PLRCAP Hub <noreply@plrcap.org>';

    // Azure Communication Services connection string
    // Set AZURE_COMMUNICATION_CONNECTION_STRING in your .env
    // It looks like: endpoint=https://<resource>.communication.azure.com/;accesskey=<key>
    const connectionString = this.config.get<string>(
      'AZURE_COMMUNICATION_CONNECTION_STRING',
    );

    if (!connectionString) {
      throw new Error(
        'AZURE_COMMUNICATION_CONNECTION_STRING is not set in environment variables.',
      );
    }

    this.client = new EmailClient(connectionString);
  }

  // ─── Template renderer — unchanged ───────────────────────────────────────

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

  // ─── Core send — uses Azure Communication Email SDK ──────────────────────

  private async send(
    options: SendEmailOptions,
  ): Promise<{ status: boolean; message: string }> {
    try {
      const message: Parameters<EmailClient['beginSend']>[0] = {
        senderAddress: this.fromAddress,
        recipients: {
          to: [{ address: options.to }],
        },
        content: {
          subject: options.subject,
          html: options.html,
        },
        // Map attachments to Azure SDK format if present
        ...(options.attachments?.length && {
          attachments: options.attachments.map((a) => ({
            name: a.name,
            contentType: a.contentType,
            contentInBase64: a.contentInBase64,
          })),
        }),
      };

      // beginSend returns a poller — we wait for it to complete
      const poller = await this.client.beginSend(message);
      const result = await poller.pollUntilDone();

      if (result.status === 'Succeeded') {
        this.logger.log(`Email sent to ${options.to} (id: ${result.id})`);
        return { status: true, message: 'Email sent successfully.' };
      }

      // Azure reported a non-success status
      this.logger.error(
        `Azure email delivery failed for ${options.to}: status=${result.status}`,
        result.error,
      );
      return {
        status: false,
        message: `Email delivery failed: ${result.status}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error);
      return { status: false, message: 'Failed to send email.' };
    }
  }

  // ─── All email methods below are unchanged — only send() was replaced ─────

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

  async sendPasswordResetOtp(params: {
    fullName: string;
    email: string;
    resetUrl: string;
  }) {
    const html = await this.renderTemplate('reset-password', params);
    return this.send({
      to: params.email,
      subject: 'Your PLRCAP Hub Password Reset Link',
      html,
    });
  }

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

  async sendEventRegistrationConfirmation(params: {
    fullName: string;
    email: string;
    eventTitle: string;
    startTime: Date;
    endTime: Date;
    meetingUrl: string;
    icsContent: string;
  }) {
    const html = await this.renderTemplate('event-registration', params);
    return this.send({
      to: params.email,
      subject: `Registration Confirmed: ${params.eventTitle}`,
      html,
      attachments: [
        {
          name: 'event.ics',
          contentType: 'text/calendar',
          contentInBase64: Buffer.from(params.icsContent).toString('base64'),
        },
      ],
    });
  }

  async sendEventUpdateNotification(params: {
    fullName: string;
    email: string;
    eventTitle: string;
    startTime: Date;
    endTime: Date;
    meetingUrl: string;
  }) {
    const html = await this.renderTemplate('event-update', params);
    return this.send({
      to: params.email,
      subject: `Event Updated: ${params.eventTitle}`,
      html,
    });
  }

  async sendEventCancellationNotification(params: {
    fullName: string;
    email: string;
    eventTitle: string;
    reason?: string;
  }) {
    const html = await this.renderTemplate('event-cancellation', params);
    return this.send({
      to: params.email,
      subject: `Event Cancelled: ${params.eventTitle}`,
      html,
    });
  }

  async sendMentorRequestNotification(params: {
    mentorName: string;
    mentorEmail: string;
    ngoName: string;
    ngoUserName: string;
    dashboardUrl: string;
  }) {
    const html = await this.renderTemplate('mentor-request', params);
    return this.send({
      to: params.mentorEmail,
      subject: `New Mentorship Request from ${params.ngoName}`,
      html,
    });
  }

  async sendMentorRequestDecision(params: {
    ngoName: string;
    ngoEmail: string;
    mentorName: string;
    decision: 'APPROVED' | 'DECLINED';
    message?: string;
    dashboardUrl: string;
  }) {
    const html = await this.renderTemplate('mentor-decision', params);
    const subject =
      params.decision === 'APPROVED'
        ? `Your mentorship request was accepted by ${params.mentorName}`
        : `Update on your mentorship request from ${params.mentorName}`;
    return this.send({ to: params.ngoEmail, subject, html });
  }

  async sendODACompletionNotification(params: {
    fullName: string;
    email: string;
    orgName: string;
    dashboardUrl: string;
  }) {
    const html = await this.renderTemplate('oda-completion', params);
    return this.send({
      to: params.email,
      subject: `Your ODA Assessment Report is Ready — ${params.orgName}`,
      html,
    });
  }

  async sendODANewSubmissionAlert(params: {
    adminEmail: string;
    orgName: string;
    overallScore: number;
    adminDashboardUrl: string;
  }) {
    const html = await this.renderTemplate('oda-submission-alert', params);
    return this.send({
      to: params.adminEmail,
      subject: `New ODA Submission — ${params.orgName}`,
      html,
    });
  }

  // ─── Contact Us ───────────────────────────────────────────────────────────

  async sendContactNotification(message: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    subject: string;
    message: string;
    createdAt: Date;
  }) {
    const supportEmail =
      this.config.get<string>('SUPPORT_EMAIL') ??
      this.config.get<string>('EMAIL_FROM');

    if (!supportEmail) {
      this.logger.warn(
        'SUPPORT_EMAIL is not set — skipping contact notification',
      );
      return { status: false, message: 'SUPPORT_EMAIL not configured.' };
    }

    const html = await this.renderTemplate('contact-notification', message);
    return this.send({
      to: supportEmail,
      subject: `[Contact Form] ${message.subject} — from ${message.name}`,
      html,
    });
  }

  async sendContactAutoReply(params: { name: string; email: string }) {
    const html = await this.renderTemplate('contact-received', params);
    return this.send({
      to: params.email,
      subject: 'We received your message — PLRCAP NGO Hub',
      html,
    });
  }
}
