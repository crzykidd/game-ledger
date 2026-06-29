import { IsString, MinLength } from 'class-validator';

export class ConsumeResetDto {
  @IsString()
  @MinLength(10)
  password!: string;
}
