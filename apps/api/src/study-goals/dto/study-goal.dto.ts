import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

export class StudyGoalDeckDto {
  @IsUUID() deckId!: string;
  @IsNumber() @Min(0.01) @Max(100) priorityWeight = 1;
}

export class CreateStudyGoalDto {
  @IsString() @Length(1, 200) name!: string;
  @IsIn(['IELTS', 'TOEIC', 'Exam', 'Interview', 'Custom']) goalType!: string;
  @IsDateString({ strict: true }) targetDate!: string;
  @IsInt() @Min(1) @Max(1_440) dailyStudyMinutes!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  studyDaysOfWeek!: number[];
  @IsNumber() @Min(0.7) @Max(0.97) desiredRetention = 0.9;
  @IsInt() @Min(0) @Max(90) finalReviewDays = 10;
  @IsInt() @Min(0) @Max(1_000) maxNewCardsPerDay = 50;
  @IsString() @Length(1, 100) timeZone!: string;
  @IsOptional() @IsIn(['Active', 'Paused', 'Completed', 'Archived']) status?: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StudyGoalDeckDto)
  decks!: StudyGoalDeckDto[];
}

export class UpdateStudyGoalDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsIn(['IELTS', 'TOEIC', 'Exam', 'Interview', 'Custom']) goalType?: string;
  @IsOptional() @IsDateString({ strict: true }) targetDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_440) dailyStudyMinutes?: number;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  studyDaysOfWeek?: number[];
  @IsOptional() @IsNumber() @Min(0.7) @Max(0.97) desiredRetention?: number;
  @IsOptional() @IsInt() @Min(0) @Max(90) finalReviewDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000) maxNewCardsPerDay?: number;
  @IsOptional() @IsString() @Length(1, 100) timeZone?: string;
  @IsOptional() @IsIn(['Active', 'Paused', 'Completed', 'Archived']) status?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StudyGoalDeckDto)
  decks?: StudyGoalDeckDto[];
}

export class AttachStudyGoalDeckDto {
  @IsUUID() deckId!: string;
  @IsOptional() @IsNumber() @Min(0.01) @Max(100) priorityWeight = 1;
}

export class StudyGoalListQueryDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page = 1;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class RunForecastDto {
  @IsOptional() @IsInt() seed?: number;
}
