import type { ReviewRating } from '@flashcard/contracts';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

const reviewRatings: readonly ReviewRating[] = ['Again', 'Hard', 'Good', 'Easy'];

export class SubmitReviewDto {
  @IsUUID() clientEventId!: string;
  @IsUUID() cardId!: string;
  @IsUUID() sessionId!: string;
  @IsUUID() deviceId!: string;
  @IsIn(reviewRatings) rating!: ReviewRating;
  @IsDate() @Type(() => Date) shownAtUtc!: Date;
  @IsOptional() @IsDate() @Type(() => Date) revealedAtUtc?: Date;
  @IsDate() @Type(() => Date) gradedAtUtc!: Date;
  @IsDate() @Type(() => Date) reviewedAtUtc!: Date;
  @IsInt() @Min(1) cardVersionBefore!: number;
}

export class SubmitBulkReviewDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitReviewDto)
  reviews!: SubmitReviewDto[];
}

export class ReviewQueueQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(86400) budgetSeconds?: number;
  @IsOptional() @IsUUID() studyGoalId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) date?: string;
}
