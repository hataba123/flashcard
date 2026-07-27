import type { StudyGoalStatus, StudyGoalType } from '@flashcard/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

@Entity({ name: 'study_goals' })
@Index(['userId', 'status'])
@Index(['userId', 'targetDate'])
export class StudyGoalEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('nvarchar', { length: 200 }) name!: string;
  @Column('nvarchar', { length: 20 }) goalType!: StudyGoalType;
  @Column('date') targetDate!: string;
  @Column('int') dailyStudyMinutes!: number;
  @Column('nvarchar', { length: 30 }) studyDaysOfWeekJson!: string;
  @Column({ type: 'decimal', precision: 4, scale: 2 }) desiredRetention!: number;
  @Column('int') finalReviewDays!: number;
  @Column('int') maxNewCardsPerDay!: number;
  @Column('nvarchar', { length: 100 }) timeZone!: string;
  @Column('nvarchar', { length: 20, default: 'Active' }) status!: StudyGoalStatus;
  @Column('int', { default: 1 }) version!: number;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
  @UpdateDateColumn({ type: 'datetime2' }) updatedAtUtc!: Date;
}
