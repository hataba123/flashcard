import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

export enum RawInputStatus {
  Pending = 'Pending',
  Normalized = 'Normalized',
  Candidate = 'Candidate',
  Admitted = 'Admitted',
  Backlog = 'Backlog',
  Rejected = 'Rejected'
}

@Entity({ name: 'raw_inputs' })
@Index(['userId', 'status', 'deletedAtUtc'])
@Index(['userId', 'normalizedHash'], { unique: true })
export class RawInputEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column({ type: 'nvarchar', length: 'MAX' }) contentRaw!: string;
  @Column({ length: 50 }) sourceType!: string;
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true }) sourceMetadataJson!: string | null;
  @Column({ length: 64 }) normalizedHash!: string;
  @Column({ length: 20, default: RawInputStatus.Pending }) status!: RawInputStatus;
  @CreateDateColumn({ type: 'datetime2' }) ingestedAtUtc!: Date;
  @Column({ type: 'datetime2', nullable: true }) processedAtUtc!: Date | null;
  @Column({ type: 'int', default: 1 }) version!: number;
  @DeleteDateColumn({ type: 'datetime2', nullable: true }) deletedAtUtc!: Date | null;
  @UpdateDateColumn({ type: 'datetime2' }) updatedAtUtc!: Date;
}
