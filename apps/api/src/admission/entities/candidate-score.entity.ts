import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';

import { RawInputEntity } from './raw-input.entity.js';

@Entity({ name: 'candidate_scores' })
export class CandidateScoreEntity {
  @PrimaryColumn('uuid') rawInputId!: string;
  @OneToOne(() => RawInputEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rawInputId' })
  rawInput!: RawInputEntity;
  @Column({ type: 'float' }) priorityScore!: number;
  @Column({ type: 'float' }) difficultyPrior!: number;
  @Column({ type: 'float' }) atomicityScore!: number;
  @Column({ type: 'float' }) duplicateScore!: number;
  @Column({ type: 'int' }) estimatedReviewSeconds!: number;
  @Column({ type: 'datetime2' }) evaluatedAtUtc!: Date;
}
