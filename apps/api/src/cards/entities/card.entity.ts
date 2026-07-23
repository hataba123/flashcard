import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

export enum CardState {
  New = 'New',
  Learning = 'Learning',
  Review = 'Review',
  Relearning = 'Relearning'
}

@Entity({ name: 'cards' })
@Index(['userId', 'dueAtUtc', 'state', 'suspendedAtUtc'])
@Index(['noteId', 'templateOrdinal'], { unique: true })
export class CardEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('uuid') noteId!: string;
  @Column('uuid') deckId!: string;
  @Column({ type: 'int' }) templateOrdinal!: number;
  @Column('nvarchar', { length: 20, default: CardState.New }) state!: CardState;
  @Column({ type: 'datetime2' }) dueAtUtc!: Date;
  @Column({ type: 'datetime2', nullable: true }) lastReviewAtUtc!: Date | null;
  @Column({ type: 'float', default: 0 }) stability!: number;
  @Column({ type: 'float', default: 0 }) difficulty!: number;
  @Column({ type: 'int', default: 0 }) elapsedDays!: number;
  @Column({ type: 'int', default: 0 }) scheduledDays!: number;
  @Column({ type: 'int', default: 0 }) learningStep!: number;
  @Column({ type: 'int', default: 0 }) reviewCount!: number;
  @Column({ type: 'int', default: 0 }) lapseCount!: number;
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 }) priorityWeight!: number;
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 }) importanceWeight!: number;
  @Column({ type: 'int', default: 12 }) estimatedReviewSeconds!: number;
  @Column('bit', { default: false }) isLeech!: boolean;
  @Column({ type: 'datetime2', nullable: true }) suspendedAtUtc!: Date | null;
  @Column({ type: 'int', default: 1 }) version!: number;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
  @UpdateDateColumn({ type: 'datetime2' }) updatedAtUtc!: Date;
  @DeleteDateColumn({ type: 'datetime2', nullable: true }) deletedAtUtc!: Date | null;
}
