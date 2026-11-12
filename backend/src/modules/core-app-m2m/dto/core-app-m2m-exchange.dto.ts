import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CoreAppM2mExchangeDto {
  @IsString()
  @MinLength(3)
  clientId!: string;

  @IsString()
  @MinLength(8)
  clientSecret!: string;

  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsString()
  scope?: string;
}
