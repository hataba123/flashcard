import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

@Entity({ name: 'study_goal_daily_availability' })
@Index(['userId', 'studyGoalId', 'studyDate'], { unique: true })
export class StudyGoalDailyAvailabilityEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('uuid') studyGoalId!: string;
  @Column('date') studyDate!: string;
  @Column('int') availableMinutes!: number;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
  @UpdateDateColumn({ type: 'datetime2' }) updatedAtUtc!: Date;
}
