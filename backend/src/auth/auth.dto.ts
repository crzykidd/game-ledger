import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { ThemePref } from '@game-ledger/contract';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class PatchMeDto {
  @IsEnum(ThemePref)
  themePref!: ThemePref;
}
