import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsEnum,
  IsOptional,
  MinLength,
  IsArray,
  Matches,
} from 'class-validator';
import { Role, ApprovalStatus } from '@prisma/client';

// ─────────────────────────────────────────────
// REQUEST DTOs
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

  @ApiProperty({ example: 'NGO_MEMBER', enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message:
      'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.',
  })
  password: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  // --- Expert Specific ---
  @ApiPropertyOptional({ example: ['Governance', 'Finance'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
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
  @IsString()
  @IsNotEmpty()
  otp: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'john.doe@ngo.org' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  otp: string;

  @ApiProperty({ example: 'NewStrongPassword123!' })
  @IsString()
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

  @ApiPropertyOptional({ example: 'I am a governance specialist...' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: ['Governance', 'Finance'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  showContactToPublic?: boolean;
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class OrganizationSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() cacNumber: string;
  @ApiProperty() sector: string;
  @ApiProperty() state: string;
  @ApiProperty() isSpotlight: boolean;
  @ApiPropertyOptional() logoUrl?: string;
  @ApiProperty() createdAt: Date;
}

export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ enum: Role }) role: Role;
  @ApiProperty({ enum: ApprovalStatus }) status: ApprovalStatus;
  @ApiPropertyOptional() phoneNumber?: string;
  @ApiPropertyOptional() bio?: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiProperty() skills: string[];
  @ApiProperty() isExpertVerified: boolean;
  @ApiProperty() showContactToPublic: boolean;
  @ApiProperty({ type: [OrganizationSummaryDto] })
  organizations: OrganizationSummaryDto[];
  @ApiProperty() createdAt: Date;
}

export class LoginResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiProperty({
    example: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      user: { id: 'uuid', fullName: 'John Doe', role: 'NGO_MEMBER' },
    },
  })
  data: { token: string; user: Partial<UserResponseDto> };
}

export class SignUpResponseDto {
  @ApiProperty() status: boolean;
  @ApiProperty() statusCode: number;
  @ApiProperty() message: string;
  @ApiProperty({
    example: { id: 'uuid', email: 'john@ngo.org', role: 'NGO_MEMBER' },
  })
  data: { id: string; email: string; role: Role };
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
  @ApiPropertyOptional({
    example: 'https://yourstorage.blob.core.windows.net/avatars/uuid.jpg',
  })
  avatarUrl?: string;
}
