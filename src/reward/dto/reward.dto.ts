import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class RewardDto {
  @ApiProperty({
    description: 'UUID of the user receiving the reward',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'UUID of the badge',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty()
  badgeId: string;

  @ApiProperty({
    description: 'Title of the reward',
    example: 'First Badge Awarded',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Description of the reward',
    example: 'Congratulations on your first badge!',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Points to be awarded to the user (optional)',
    example: 2,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number;
}
