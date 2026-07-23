import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from 'class-validator';

export class PushSyncEventDto {
  @IsString() entityType!: string;
  @IsUUID() entityId!: string;
  @IsIn(['Created', 'Updated', 'Deleted']) operation!: 'Created' | 'Updated' | 'Deleted';
  @IsInt() @Min(1) entityVersion!: number;
  @IsObject() payload!: Record<string, unknown>;
  @IsOptional() @IsUUID() deviceId?: string;
  @IsUUID() clientEventId!: string;
}
export class PushSyncDto {
  @IsArray() events!: PushSyncEventDto[];
}
export class PullSyncQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cursor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}
