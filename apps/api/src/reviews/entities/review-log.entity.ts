import type { ReviewEventType, ReviewRating } from '@flashcard/contracts';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { CardState } from '../../cards/entities/card.entity.js';

@Entity({ name: 'review_logs' })
@Index(['userId', 'clientEventId'], { unique: true })
@Index(['cardId', 'reviewedAtUtc'])
export class ReviewLogEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') clientEventId!: string;
  @Column('uuid') userId!: string;
  @Column('uuid') cardId!: string;
  @Column('uuid') sessionId!: string;
  @Column('uuid') deviceId!: string;
  @Column({ length: 16 }) eventType!: ReviewEventType;
  @Column({ type: 'nvarchar', length: 8, nullable: true }) rating!: ReviewRating | null;
  @Column({ type: 'datetime2' }) shownAtUtc!: Date;
  @Column({ type: 'datetime2', nullable: true }) revealedAtUtc!: Date | null;
  @Column({ type: 'datetime2' }) gradedAtUtc!: Date;
  @Column({ type: 'datetime2' }) reviewedAtUtc!: Date;
  @Column({ type: 'int' }) answerLatencyMs!: number;
  @Column({ type: 'float' }) retrievabilityBefore!: number;
  @Column({ type: 'float' }) stabilityBefore!: number;
  @Column({ type: 'float' }) stabilityAfter!: number;
  @Column({ type: 'float' }) difficultyBefore!: number;
  @Column({ type: 'float' }) difficultyAfter!: number;
  @Column({ type: 'int' }) elapsedDaysBefore!: number;
  @Column({ type: 'int' }) elapsedDaysAfter!: number;
  @Column({ type: 'int' }) scheduledDaysBefore!: number;
  @Column({ type: 'int' }) scheduledDaysAfter!: number;
  @Column({ type: 'int' }) learningStepBefore!: number;
  @Column({ type: 'int' }) learningStepAfter!: number;
  @Column({ type: 'int' }) reviewCountBefore!: number;
  @Column({ type: 'int' }) reviewCountAfter!: number;
  @Column({ type: 'int' }) lapseCountBefore!: number;
  @Column({ type: 'int' }) lapseCountAfter!: number;
  @Column({ length: 20 }) stateBefore!: CardState;
  @Column({ length: 20 }) stateAfter!: CardState;
  @Column({ type: 'datetime2' }) dueBeforeUtc!: Date;
  @Column({ type: 'datetime2' }) dueAfterUtc!: Date;
  @Column({ type: 'datetime2', nullable: true }) lastReviewBeforeUtc!: Date | null;
  @Column({ type: 'datetime2', nullable: true }) lastReviewAfterUtc!: Date | null;
  @Column({ type: 'int' }) cardVersionBefore!: number;
  @Column({ type: 'int' }) cardVersionAfter!: number;
  @CreateDateColumn({ type: 'datetime2' }) serverReceivedAtUtc!: Date;
  @Column('uuid', { nullable: true }) undoOfReviewLogId!: string | null;
}
