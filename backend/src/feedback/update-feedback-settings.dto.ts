import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateFeedbackSettingsDto {
  @IsOptional()
  @IsBoolean()
  githubEnabled?: boolean;

  @IsOptional()
  @IsString()
  githubRepoOwner?: string | null;

  @IsOptional()
  @IsString()
  githubRepoName?: string | null;

  @IsOptional()
  @IsString()
  githubAssetBranch?: string | null;

  @IsOptional()
  @IsString()
  githubToken?: string | null;
}
