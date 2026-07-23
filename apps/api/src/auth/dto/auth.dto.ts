import { Type } from 'class-transformer';
import { IsEmail, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsUUID()
  deviceId!: string;

  @IsString()
  @Length(1, 100)
  deviceName!: string;

  @Type(() => String)
  @IsString()
  @Length(1, 100)
  platform!: string;
}

export class LoginDto extends RegisterDto {}
