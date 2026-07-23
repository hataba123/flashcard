import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn
} from 'typeorm';

@Entity({ name: 'media_files' })
@Index(['userId', 'sha256Hash'])
export class MediaFileEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column({ length: 20 }) storageProvider!: 'local' | 's3';
  @Column({ length: 500 }) storageKey!: string;
  @Column({ length: 255 }) originalFileName!: string;
  @Column({ length: 100 }) contentType!: string;
  @Column({ type: 'bigint' }) sizeBytes!: string;
  @Column({ length: 64 }) sha256Hash!: string;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
  @DeleteDateColumn({ type: 'datetime2', nullable: true }) deletedAtUtc!: Date | null;
}
