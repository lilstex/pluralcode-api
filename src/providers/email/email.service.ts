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
    // this.viewsPath = path.join(process.cwd(), 'views');
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
    resetUrl: string;
  }) {
    const html = await this.renderTemplate('reset-password', params);
    return this.send({
      to: params.email,
      subject: 'Your PLRCAP Hub Password Reset Link',
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

  /**
   * Send event registration confirmation with ICS calendar attachment.
   */
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
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.email,
        subject: `Registration Confirmed: ${params.eventTitle}`,
        html,
        attachments: [
          {
            filename: 'event.ics',
            content: params.icsContent,
            contentType: 'text/calendar; method=REQUEST',
          },
        ],
      });
      this.logger.log(
        `Event registration email sent to ${params.email}: ${info.messageId}`,
      );
      return { status: true, message: 'Email sent successfully.' };
    } catch (error) {
      this.logger.error(
        `Failed to send event registration email to ${params.email}`,
        error,
      );
      return { status: false, message: 'Failed to send email.' };
    }
  }

  /**
   * Notify attendee of event time/details update.
   */
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

  /**
   * Notify attendee that an event has been cancelled.
   */
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

  /**
   * Notify an expert that an NGO has sent them a mentor request.
   */
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

  /**
   * Notify the NGO of the expert's decision (approved or declined).
   */
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

  /**
   * Sent to the NGO owner when the internal scoring engine finishes and the
   * assessment status transitions to COMPLETED.
   */
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

  /**
   * Sent to all SUPER_ADMIN users when an NGO submits a completed assessment.
   * Call once per admin email
   */
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

  // ─── Contact Us ───────────────────────────────────────────────────────────────

  /**
   * Forward a new contact form submission to the support inbox.
   * Recipient is determined by SUPPORT_EMAIL env var.
   */
  async sendContactNotification(message: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    subject: string;
    message: string;
    createdAt: Date;
  }) {
    const supportEmail = process.env.SUPPORT_EMAIL ?? process.env.SMTP_FROM;
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

  /**
   * Auto-reply confirmation sent to the person who submitted the contact form.
   */
  async sendContactAutoReply(params: { name: string; email: string }) {
    const html = await this.renderTemplate('contact-received', params);
    return this.send({
      to: params.email,
      subject: 'We received your message — PLRCAP NGO Hub',
      html,
    });
  }
}
