import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

@Entity({ name: 'decks' })
@Index(['userId', 'deletedAtUtc'])
export class DeckEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column({ length: 200 }) name!: string;
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true }) description!: string | null;
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0.86 }) desiredRetention!: number;
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 }) priorityWeight!: number;
  @Column({ type: 'int', default: 20 }) dailyNewCardLimit!: number;
  @Column({ default: false }) isCore!: boolean;
  @Column({ default: false }) isArchived!: boolean;
  @Column({ type: 'int', default: 1 }) version!: number;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
  @UpdateDateColumn({ type: 'datetime2' }) updatedAtUtc!: Date;
  @DeleteDateColumn({ type: 'datetime2', nullable: true }) deletedAtUtc!: Date | null;
}
