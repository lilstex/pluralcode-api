import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
} from 'class-validator';

// ─────────────────────────────────────────────
// REQUEST DTOs
// ─────────────────────────────────────────────

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Save The Children Nigeria' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'CAC/IT/123456' })
  @IsNotEmpty()
  @IsString()
  cacNumber: string;

  @ApiProperty({ example: 'Health' })
  @IsNotEmpty()
  @IsString()
  sector: string;

  @ApiProperty({ example: 'Lagos' })
  @IsNotEmpty()
  @IsString()
  state: string;

  @ApiPropertyOptional({ example: 'https://savethechildren.org' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'Brief description of the organization...' })
  @IsOptional()
  @IsString()
  description?: string;
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

export class AssignUsersToOrgDto {
  @ApiProperty({
    description: 'Array of User UUIDs to assign to this organization',
    example: ['uuid-1', 'uuid-2'],
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  userIds: string[];
}

export class RemoveUsersFromOrgDto {
  @ApiProperty({
    description: 'Array of User UUIDs to remove from this organization',
    example: ['uuid-1', 'uuid-2'],
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  userIds: string[];
}

// ─────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────

export class OrgMemberDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiProperty() role: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional() avatarUrl?: string;
}

export class OrganizationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() cacNumber: string;
  @ApiProperty() sector: string;
  @ApiProperty() state: string;
  @ApiProperty() isSpotlight: boolean;
  @ApiPropertyOptional() spotlightExpiresAt?: Date;
  @ApiPropertyOptional() website?: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ type: [OrgMemberDto] }) members: OrgMemberDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
