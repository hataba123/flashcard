import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'study_goal_decks' })
@Index(['deckId'])
export class StudyGoalDeckEntity {
  @PrimaryColumn('uuid') studyGoalId!: string;
  @PrimaryColumn('uuid') deckId!: string;
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 }) priorityWeight!: number;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
}
