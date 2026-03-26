import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsInt,
  IsArray,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────
// ORGANIZATION CORE DTOs
// ─────────────────────────────────────────────

export class UpdateOrganizationDto {
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
    description: 'Thematic sectors the organization works in',
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
    description: 'Social media links: [{ "facebook": "url" }, { "x": "url" }]',
    example: [
      { facebook: 'https://facebook.com/stcng' },
      { x: 'https://x.com/stcng' },
    ],
  })
  @IsOptional()
  socials?: any[];

  @ApiPropertyOptional({
    description: 'Document links: [{ "plans": "url" }, { "report": "url" }]',
    example: [
      { website: 'https://stc.org/annual-report-2024.pdf' },
      { report: 'https://stc.org/annual-report-2024.pdf' },
    ],
  })
  @IsOptional()
  otherLinks?: any[];

  @ApiPropertyOptional({
    example: 'We work across Nigeria to promote child welfare...',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Is your organization a local/national organization in Nigeria?',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isLocalOrNational?: boolean;

  @ApiPropertyOptional({
    description:
      'Does your organization have experience working in humanitarian contexts?',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasHumanitarianExperience?: boolean;

  @ApiPropertyOptional({
    description:
      'Is your organization interested in registering for training and mentorship programs?',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isInterestedInTraining?: boolean;
}

// ─────────────────────────────────────────────
// EXTENSION TABLE DTOs
// ─────────────────────────────────────────────

export class CreateActivityDto {
  @ApiProperty({ example: 'Health' })
  @IsNotEmpty()
  @IsString()
  sector: string;

  @ApiProperty({ example: 'Women and children under 5' })
  @IsNotEmpty()
  @IsString()
  who: string;

  @ApiProperty({ example: 'Kano State' })
  @IsNotEmpty()
  @IsString()
  where: string;

  @ApiProperty({
    example: 2024,
    description: 'Year the activity was carried out',
  })
  @IsInt()
  @Min(1900)
  @Type(() => Number)
  when: number;

  @ApiProperty({
    example:
      'Conducted free medical outreach for 2,000 children across 12 communities.',
  })
  @IsNotEmpty()
  @IsString()
  activity: string;
}

export class UpdateActivityDto {
  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() who?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() where?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Type(() => Number)
  when?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() activity?: string;
}

export class CreateDonorDto {
  @ApiProperty({ example: 'USAID' })
  @IsNotEmpty()
  @IsString()
  donor: string;

  @ApiProperty({
    example: '$500,000',
    description: 'Free-text amount or range',
  })
  @IsNotEmpty()
  @IsString()
  amount: string;

  @ApiProperty({
    example: '2022–2025',
    description: 'Grant duration or period',
  })
  @IsNotEmpty()
  @IsString()
  duration: string;
}

export class UpdateDonorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() donor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() amount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() duration?: string;
}

export class CreateAssessmentDto {
  @ApiProperty({ example: 'CharityNavigator Nigeria' })
  @IsNotEmpty()
  @IsString()
  assessmentBody: string;

  @ApiProperty({ example: 3, description: 'Month number 1–12' })
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month: number;

  @ApiProperty({ example: 2024 })
  @IsInt()
  @Min(2000)
  @Type(() => Number)
  year: number;
}

export class UpdateAssessmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() assessmentBody?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Type(() => Number)
  year?: number;
}

// ─────────────────────────────────────────────
// MEMBERSHIP DTOs
// ─────────────────────────────────────────────

export class AddMemberDto {
  @ApiProperty({
    example: 'user-uuid',
    description: 'UUID of the GUEST user to add as a member',
  })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiPropertyOptional({
    example: 'member',
    description: 'Role within the organization — "member" (default) or "admin"',
  })
  @IsOptional()
  @IsString()
  orgRole?: string;
}

export class InviteAndAddMemberDto {
  @ApiProperty({
    example: 'jane.doe@email.com',
    description: 'Email of the new user to invite',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    example: 'member',
    description: 'Role within the organization — "member" (default) or "admin"',
  })
  @IsOptional()
  @IsString()
  orgRole?: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({
    example: 'admin',
    description: 'New role: "member" or "admin"',
  })
  @IsNotEmpty()
  @IsString()
  orgRole: string;
}

// ─────────────────────────────────────────────
// QUERY DTOs
// ─────────────────────────────────────────────

export class OrgQueryDto {
  @ApiPropertyOptional({
    description: 'Search by name, acronym, or CAC number',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'Health',
    description: 'Filter by a single sector value',
  })
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class ActivityResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() sector: string;
  @ApiProperty() who: string;
  @ApiProperty() where: string;
  @ApiProperty() when: number;
  @ApiProperty() activity: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class DonorResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() donor: string;
  @ApiProperty() amount: string;
  @ApiProperty() duration: string;
  @ApiProperty() createdAt: Date;
}

export class AssessmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() assessmentBody: string;
  @ApiProperty() month: number;
  @ApiProperty() year: number;
  @ApiProperty() createdAt: Date;
}

export class MemberUserDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiPropertyOptional() phoneNumber?: string;
}

export class MemberResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() orgRole: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional() invitedById?: string;
  @ApiProperty() joinedAt: Date;
  @ApiProperty({ type: MemberUserDto }) user: MemberUserDto;
}

export class OrganizationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() acronym?: string;
  @ApiProperty() cacNumber: string;
  @ApiProperty() phoneNumber: string;
  @ApiPropertyOptional() publicEmail?: string;
  @ApiProperty() state: string;
  @ApiProperty() lga: string;
  @ApiPropertyOptional() address?: string;
  @ApiPropertyOptional() logoUrl?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() mission?: string;
  @ApiPropertyOptional() vision?: string;
  @ApiProperty({ type: [String] }) sectors: string[];
  @ApiPropertyOptional() numberOfStaff?: number;
  @ApiPropertyOptional() numberOfVolunteers?: number;
  @ApiPropertyOptional() annualBudget?: string;
  @ApiProperty({ description: 'Is a local/national organization in Nigeria' })
  isLocalOrNational: boolean;
  @ApiProperty({
    description: 'Has experience working in humanitarian contexts',
  })
  hasHumanitarianExperience: boolean;
  @ApiProperty({
    description: 'Interested in training and mentorship programs',
  })
  isInterestedInTraining: boolean;
  @ApiProperty() socials: any[];
  @ApiProperty() otherLinks: any[];
  @ApiProperty({ type: [ActivityResponseDto] })
  activities: ActivityResponseDto[];
  @ApiProperty({ type: [DonorResponseDto] }) donors: DonorResponseDto[];
  @ApiProperty({ type: [AssessmentResponseDto] })
  assessments: AssessmentResponseDto[];
  @ApiProperty({ type: [MemberResponseDto] }) members: MemberResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class OrganizationSummaryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() acronym?: string;
  @ApiProperty() cacNumber: string;
  @ApiProperty() state: string;
  @ApiProperty() lga: string;
  @ApiProperty({ type: [String] }) sectors: string[];
  @ApiPropertyOptional() logoUrl?: string;
  @ApiPropertyOptional() mission?: string;
  @ApiPropertyOptional() numberOfStaff?: number;
  @ApiPropertyOptional() numberOfVolunteers?: number;
  @ApiProperty({ description: 'Is a local/national organization in Nigeria' })
  isLocalOrNational: boolean;
  @ApiProperty({
    description: 'Has experience working in humanitarian contexts',
  })
  hasHumanitarianExperience: boolean;
  @ApiProperty({
    description: 'Interested in training and mentorship programs',
  })
  isInterestedInTraining: boolean;
  @ApiProperty() createdAt: Date;
}

// ─────────────────────────────────────────────
// DASHBOARD DTOs
// ─────────────────────────────────────────────

export class DashboardEventDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() startTime: Date;
  @ApiProperty() endTime: Date;
  @ApiPropertyOptional() coverImageUrl?: string;
  @ApiPropertyOptional() externalMeetingUrl?: string;
  @ApiPropertyOptional() capacity?: number;
  @ApiProperty({ type: [String] }) tags: string[];
}

export class DashboardActivityDto {
  @ApiProperty() id: string;
  @ApiProperty() sector: string;
  @ApiProperty() who: string;
  @ApiProperty() where: string;
  @ApiProperty() when: number;
  @ApiProperty() activity: string;
  @ApiProperty() createdAt: Date;
}

export class OrgDashboardResponseDto {
  @ApiProperty({ description: 'Profile completion percentage (0–100)' })
  profileCompletion: number;

  @ApiProperty({ description: 'Total number of program activities logged' })
  activityCount: number;

  @ApiProperty({
    description: 'Total number of ODA assessments (all statuses)',
  })
  assessmentCount: number;

  @ApiProperty({
    description: 'Points earned by the organization owner (resource downloads)',
  })
  pointsEarned: number;

  @ApiProperty({
    description: 'Number of badges earned by the organization owner',
  })
  badgeCount: number;

  @ApiProperty({
    type: [DashboardEventDto],
    description: 'Up to 10 upcoming events',
  })
  upcomingEvents: DashboardEventDto[];

  @ApiProperty({
    type: [DashboardActivityDto],
    description: 'Up to 10 most recent activities',
  })
  recentActivities: DashboardActivityDto[];
}

// Response DTO for a single assessment item
export class ExternalAssessmentRecordResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() assessmentBody: string;
  @ApiProperty() month: number;
  @ApiProperty() year: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

// Wrapped response for the API
export class ExternalAssessmentListResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty({ type: [ExternalAssessmentRecordResponseDto] })
  data: ExternalAssessmentRecordResponseDto[];
}
