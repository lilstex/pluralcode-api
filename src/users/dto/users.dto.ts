import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsEnum,
  IsOptional,
  MinLength,
  IsArray,
  IsInt,
  Min,
  Matches,
  ValidateIf,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role, ApprovalStatus } from '@prisma/client';

// ─────────────────────────────────────────────
// AUTH DTOs
// ─────────────────────────────────────────────

export class CreateUserDto {
  @ApiProperty({ example: 'john.doe@ngo.org' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ enum: Role, example: 'NGO_MEMBER' })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message:
      'Password must include an uppercase letter, a number, and a special character.',
  })
  password: string;

  // ── NGO_MEMBER fields (required when role === NGO_MEMBER) ─────────────────
  @ApiPropertyOptional({ example: 'Save The Children Nigeria' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsNotEmpty()
  @IsString()
  orgName?: string;

  @ApiPropertyOptional({ example: 'CAC/IT/123456' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsNotEmpty()
  @IsString()
  cacNumber?: string;

  @ApiPropertyOptional({ example: '+2348099887766' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsNotEmpty()
  @IsString()
  orgPhoneNumber?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsNotEmpty()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsNotEmpty()
  @IsString()
  lga?: string;

  @ApiPropertyOptional({ example: '12 NGO Way, Ikeja' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsOptional()
  @IsString()
  address?: string;

  // ── EXPERT fields (required when role === EXPERT) ─────────────────────────
  @ApiPropertyOptional({ example: 'Dr.' })
  @ValidateIf((o) => o.role === Role.EXPERT)
  @IsNotEmpty()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @ValidateIf((o) => o.role === Role.EXPERT)
  @IsNotEmpty()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 10 })
  @ValidateIf((o) => o.role === Role.EXPERT)
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ example: ['Governance', 'M&E'], type: [String] })
  @ValidateIf((o) => o.role === Role.EXPERT)
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  areasOfExpertise?: string[];

  @ApiPropertyOptional({
    description:
      'Is your organization a local/national organization in Nigeria?',
    example: true,
  })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isLocalOrNational?: boolean;

  @ApiPropertyOptional({
    description:
      'Does your organization have experience working in humanitarian contexts?',
    example: true,
  })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasHumanitarianExperience?: boolean;

  @ApiPropertyOptional({
    description:
      'Is your organization interested in registering for training and mentorship programs?',
    example: true,
  })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isInterestedInTraining?: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'john.doe@ngo.org' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsNotEmpty()
  @IsString()
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'john.doe@ngo.org' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'john.doe@ngo.org' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  otp: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'john.doe@ngo.org' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Reset token received via email link' })
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewStrongPassword123!' })
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message:
      'Password must include an uppercase letter, a number, and a special character.',
  })
  password: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

// ─────────────────────────────────────────────
// EXPERT PROFILE DTOs
// ─────────────────────────────────────────────

export class UpsertExpertProfileDto {
  @ApiPropertyOptional({ example: 'Dr.' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  yearsOfExperience?: number;

  @ApiPropertyOptional({
    example: 'I am a governance specialist with 12 years of experience...',
  })
  @IsOptional()
  @IsString()
  about?: string;

  @ApiPropertyOptional({ example: 'ActionAid Nigeria' })
  @IsOptional()
  @IsString()
  employer?: string;

  @ApiPropertyOptional({
    example: 'Extensive work with INGOs in West Africa...',
  })
  @IsOptional()
  @IsString()
  otherExperience?: string;

  @ApiPropertyOptional({
    example: 'I believe mentoring is a two-way street...',
  })
  @IsOptional()
  @IsString()
  mentoringPhilosophy?: string;

  @ApiPropertyOptional({ example: 'Mentored 3 NGO leaders at ActionAid...' })
  @IsOptional()
  @IsString()
  previousMentoringExperience?: string;

  @ApiPropertyOptional({
    example: '5-10',
    description: 'Capacity range e.g. "5-10" mentees',
  })
  @IsOptional()
  @IsString()
  capacityOfMentees?: string;

  @ApiPropertyOptional({
    description: 'Array of education entries',
    example: [
      {
        title: 'Degree',
        certification: 'BSC',
        institution: 'University of Ibadan',
        year: 2010,
      },
    ],
  })
  @IsOptional()
  education?: any[];

  @ApiPropertyOptional({
    example: ['Governance', 'Financial Management', 'M&E'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasOfExpertise?: string[];

  @ApiPropertyOptional({
    example: ['Mentoring', 'Training', 'Consulting'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  servicesOffered?: string[];

  @ApiPropertyOptional({
    description: 'Array of referee objects',
    example: [
      {
        name: 'John Doe',
        email: 'j@example.com',
        phone: '+234...',
        organization: 'UNICEF',
      },
    ],
  })
  @IsOptional()
  referees?: any[];

  @ApiPropertyOptional({
    example: ['email', 'phone', 'WhatsApp'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredContactMethods?: string[];

  @ApiPropertyOptional({
    description: 'Social links array',
    example: [
      { linkedin: 'https://linkedin.com/in/johndoe' },
      { x: 'https://x.com/johndoe' },
    ],
  })
  @IsOptional()
  socials?: any[];

  @ApiPropertyOptional({
    description: 'Other links array',
    example: [{ 'Personal Website': 'https://johndoe.com' }],
  })
  @IsOptional()
  otherLinks?: any[];

  @ApiPropertyOptional({
    example: [
      'Project development and implementation',
      'Resource mobilization',
    ],
    description: 'Areas the expert wants to apply their expertise',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areaToApply?: string[];

  @ApiPropertyOptional({
    example: 'Negotiable — approx. $100/hr for mentorship sessions.',
    description: 'Fee / rate information',
  })
  @IsOptional()
  @IsString()
  fees?: string;

  @ApiPropertyOptional({
    example:
      'An international development leader with 15+ years of experience...',
    description: 'Short professional pitch or bio paragraph',
  })
  @IsOptional()
  @IsString()
  companyPitch?: string;

  @ApiPropertyOptional({
    example: '20 hours per month',
    description: 'Hours available per week or month (free text)',
  })
  @IsOptional()
  @IsString()
  hoursPerWeek?: string;

  @ApiPropertyOptional({ example: 'Nigeria' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'FCT - Abuja' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({
    example:
      'Leadership, Governance, and Accountability; Effective communication...',
    description: 'Free-text description of other areas of expertise or topics',
  })
  @IsOptional()
  @IsString()
  otherAreasOfTopics?: string;

  @ApiPropertyOptional({
    example: 'University of Jos\nUniversity of Antwerp',
    description: 'Institution(s) attended — may be multiline',
  })
  @IsOptional()
  @IsString()
  institutionAttended?: string;
}
// ─────────────────────────────────────────────
// ORGANIZATION DTOs
// ─────────────────────────────────────────────

export class UpdateUserOrganizationDto {
  @ApiPropertyOptional({ example: 'Save The Children Nigeria' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'STC-NG' })
  @IsOptional()
  @IsString()
  acronym?: string;

  @ApiPropertyOptional({ example: '+2348099887766' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'info@stc.org.ng' })
  @IsOptional()
  @IsEmail()
  publicEmail?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @IsOptional()
  @IsString()
  lga?: string;

  @ApiPropertyOptional({ example: '12 NGO Way, Ikeja, Lagos' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: 'We exist to ensure every child has access to...',
  })
  @IsOptional()
  @IsString()
  mission?: string;

  @ApiPropertyOptional({
    example: 'A world where every child reaches their full potential...',
  })
  @IsOptional()
  @IsString()
  vision?: string;

  @ApiPropertyOptional({
    example: ['Health', 'Education', 'Child Protection'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectors?: string[];

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  numberOfStaff?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  numberOfVolunteers?: number;

  @ApiPropertyOptional({ example: '₦50,000,000 – ₦100,000,000' })
  @IsOptional()
  @IsString()
  annualBudget?: string;

  @ApiPropertyOptional({
    description: 'Social links: [{ "facebook": "url" }, { "x": "url" }]',
    example: [
      { facebook: 'https://facebook.com/stcng' },
      { x: 'https://x.com/stcng' },
    ],
  })
  @IsOptional()
  socials?: any[];

  @ApiPropertyOptional({
    description: 'Document links: [{ "plans": "url" }, { "report": "url" }]',
    example: [{ report: 'https://stc.org/report-2024.pdf' }],
  })
  @IsOptional()
  otherLinks?: any[];

  @ApiPropertyOptional({ example: 'We work across Nigeria to...' })
  @IsOptional()
  @IsString()
  description?: string;
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class OrganizationSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() acronym?: string;
  @ApiProperty() cacNumber: string;
  @ApiProperty() state: string;
  @ApiProperty() lga: string;
  @ApiPropertyOptional() logoUrl?: string;
  @ApiProperty() createdAt: Date;
}

export class ExpertProfileResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() yearsOfExperience?: number;
  @ApiPropertyOptional() about?: string;
  @ApiPropertyOptional() employer?: string;
  @ApiPropertyOptional() otherExperience?: string;
  @ApiPropertyOptional() mentoringPhilosophy?: string;
  @ApiPropertyOptional() previousMentoringExperience?: string;
  @ApiPropertyOptional() capacityOfMentees?: string;
  @ApiProperty() education: any[];
  @ApiProperty() areasOfExpertise: string[];
  @ApiProperty({
    type: [String],
    description: 'Areas the expert wants to apply their expertise',
  })
  areaToApply: string[];
  @ApiProperty() servicesOffered: string[];
  @ApiProperty() referees: any[];
  @ApiProperty() preferredContactMethods: string[];
  @ApiProperty() socials: any[];
  @ApiProperty() otherLinks: any[];
  @ApiPropertyOptional({ description: 'Fee / rate information' }) fees?: string;
  @ApiPropertyOptional({ description: 'Short professional pitch or bio' })
  companyPitch?: string;
  @ApiPropertyOptional({ description: 'Hours available per week or month' })
  hoursPerWeek?: string;
  @ApiPropertyOptional() country?: string;
  @ApiPropertyOptional() state?: string;
  @ApiPropertyOptional({
    description: 'Other areas of expertise or topics (free text)',
  })
  otherAreasOfTopics?: string;
  @ApiPropertyOptional({ description: 'Institution(s) attended' })
  institutionAttended?: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class OrgMembershipDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() orgRole: string;
  @ApiProperty() status: string;
  @ApiProperty() joinedAt: Date;
  @ApiProperty() organization: {
    id: string;
    name: string;
    acronym?: string;
    logoUrl?: string;
  };
}

export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ enum: Role }) role: Role;
  @ApiProperty({ enum: ApprovalStatus }) status: ApprovalStatus;
  @ApiProperty() isEmailVerified: boolean;
  @ApiPropertyOptional() phoneNumber?: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiProperty() pointsCount: number;
  @ApiPropertyOptional({ type: OrganizationSummaryDto })
  organization?: OrganizationSummaryDto;
  @ApiPropertyOptional({ type: ExpertProfileResponseDto })
  expertProfile?: ExpertProfileResponseDto;
  @ApiPropertyOptional({
    type: [OrgMembershipDto],
    description: 'Organizations the user belongs to as a member (GUEST role)',
  })
  organizationMemberships?: OrgMembershipDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class LoginResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiProperty() data: { token: string; user: Partial<UserResponseDto> };
}

export class SignUpResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiProperty() data: { id: string; email: string; role: Role };
}

export class ForgotPasswordResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
}

export class DeleteUserResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
}

export class UploadAvatarResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiPropertyOptional() avatarUrl?: string;
}
