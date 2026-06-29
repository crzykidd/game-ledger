import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateFirstUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  nickname!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;
}
