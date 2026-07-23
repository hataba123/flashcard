import { IsArray, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateRawInputDto {
  @IsString() @Length(1, 10000) contentRaw!: string;
  @IsString() @Length(1, 50) sourceType!: string;
  @IsOptional() @IsObject() sourceMetadata?: Record<string, unknown>;
}

export class CreateBulkRawInputDto {
  @IsArray() inputs!: CreateRawInputDto[];
}

export class AdmissionQueryDto {
  @IsOptional() @IsInt() @Min(60) @Max(86400) budgetSeconds?: number;
}
