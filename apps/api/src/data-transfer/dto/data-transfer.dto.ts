import { IsObject } from 'class-validator';

export class ExportDataTransferDto {
  @IsObject()
  displayPreferences!: Record<string, unknown>;
}
