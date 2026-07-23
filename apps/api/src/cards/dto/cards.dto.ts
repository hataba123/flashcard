import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min
} from 'class-validator';

export class CreateDeckDto {
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0.7) @Max(0.97) desiredRetention?: number;
  @IsOptional() @IsNumber() @Min(0.01) priorityWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) dailyNewCardLimit?: number;
  @IsOptional() @IsBoolean() isCore?: boolean;
  @IsOptional() @IsBoolean() isArchived?: boolean;
}
export class UpdateDeckDto extends CreateDeckDto {}

export class CreateNoteDto {
  @IsUUID() deckId!: string;
  @IsIn(['Basic', 'BasicAndReverse', 'Cloze']) noteType!: 'Basic' | 'BasicAndReverse' | 'Cloze';
  @IsObject() fields!: Record<string, string>;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @Length(1, 100) sourceId?: string;
}
export class UpdateNoteDto extends CreateNoteDto {}
