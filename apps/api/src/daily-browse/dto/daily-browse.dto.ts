import { IsDateString, IsIn, IsString, Length, Matches } from 'class-validator';

import type { DailyBrowseScope } from '@flashcard/contracts';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export class DailyBrowseQueryDto {
  @Matches(datePattern) @IsDateString({ strict: true }) date!: string;
  @IsString() @Length(1, 100) timeZone!: string;
}

export class DailyBrowseCardsQueryDto extends DailyBrowseQueryDto {
  @IsIn(['new', 'all'] satisfies DailyBrowseScope[]) scope!: DailyBrowseScope;
}
