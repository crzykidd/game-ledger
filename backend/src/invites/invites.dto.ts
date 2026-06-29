import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  guestPlayerId?: string;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsString()
  @MinLength(1)
  nickname!: string;

  @IsString()
  @MinLength(10)
  password!: string;
}
