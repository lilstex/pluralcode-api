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
  ValidateIf,
  IsInt,
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

  // --- NGO Specific (Required only if role is NGO_MEMBER) ---
  @ApiPropertyOptional({ example: 'Helping Hands Initiative' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsNotEmpty()
  @IsString()
  orgName?: string;

  @ApiPropertyOptional({ example: 'CAC1234567' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsNotEmpty()
  @IsString()
  cacNumber?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
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

  @ApiPropertyOptional({ example: 'No.4 Iyala Street' })
  @ValidateIf((o) => o.role === Role.NGO_MEMBER)
  @IsOptional()
  @IsString()
  address?: string;

  // --- Expert Specific (Required only if role is EXPERT) ---
  @ApiPropertyOptional({ example: 'Senior Governance Consultant' })
  @ValidateIf((o) => o.role === Role.EXPERT)
  @IsNotEmpty()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: '09013252224' })
  @ValidateIf((o) => o.role === Role.EXPERT)
  @IsNotEmpty()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 10 })
  @ValidateIf((o) => o.role === Role.EXPERT)
  @IsNotEmpty()
  @IsInt()
  yearsOfExperience?: number;

  @ApiPropertyOptional({ example: ['Policy Analysis', 'Capacity Building'] })
  @ValidateIf((o) => o.role === Role.EXPERT)
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  areasOfExpertise?: string[];
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

  @ApiProperty({ example: 'reset-token-from-email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'NewStrongPassword123!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
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

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Save The Children Nigeria' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Health' })
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'https://savethechildren.org' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'Updated description...' })
  @IsOptional()
  @IsString()
  description?: string;
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class OrganizationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() cacNumber: string;
  @ApiProperty() phoneNumber: string;
  @ApiProperty() state: string;
  @ApiProperty() lga: string;
  @ApiPropertyOptional() logoUrl?: string;
}

export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ enum: Role }) role: Role;
  @ApiProperty({ enum: ApprovalStatus }) status: ApprovalStatus;
  @ApiProperty() isEmailVerified: boolean;

  // Expert fields (null if not expert)
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() yearsOfExperience?: number;
  @ApiPropertyOptional() areasOfExpertise?: string[];

  // NGO relation (null if not NGO)
  @ApiPropertyOptional({ type: OrganizationResponseDto })
  organization?: OrganizationResponseDto;

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
