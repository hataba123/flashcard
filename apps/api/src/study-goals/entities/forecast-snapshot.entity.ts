import type { ForecastConfidence, GoalFeasibility } from '@flashcard/contracts';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'forecast_snapshots' })
@Index(['studyGoalId', 'calculatedAtUtc'])
@Index(['studyGoalId', 'inputHash'])
export class ForecastSnapshotEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') studyGoalId!: string;
  @Column('datetime2') calculatedAtUtc!: Date;
  @Column('nvarchar', { length: 30 }) algorithmVersion!: string;
  @Column('nvarchar', { length: 64 }) inputHash!: string;
  @Column('date', { nullable: true }) predictedNewCardsCompletedDate!: string | null;
  @Column('date', { nullable: true }) predictedCompletionP50Date!: string | null;
  @Column('date', { nullable: true }) predictedCompletionP80Date!: string | null;
  @Column('date', { nullable: true }) predictedCompletionP90Date!: string | null;
  @Column('float') probabilityBeforeTarget!: number;
  @Column('float') requiredDailyMinutes!: number;
  @Column('float') averageNewCardsPerDay!: number;
  @Column('float') averageReviewsPerDay!: number;
  @Column('int') overloadDays!: number;
  @Column('nvarchar', { length: 10 }) confidenceLevel!: ForecastConfidence;
  @Column('nvarchar', { length: 20 }) feasibility!: GoalFeasibility;
  @Column('int') totalCards!: number;
  @Column('int') newCards!: number;
  @Column('int') learningCards!: number;
  @Column('int') stableCards!: number;
  @Column('int') daysRemaining!: number;
  @Column('nvarchar', { length: 'MAX' }) dailyProjectionJson!: string;
  @Column('nvarchar', { length: 'MAX' }) recommendationsJson!: string;
  @Column('nvarchar', { length: 'MAX' }) scenariosJson!: string;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
}
