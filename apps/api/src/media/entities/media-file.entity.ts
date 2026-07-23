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
  @Column('nvarchar', { length: 20 }) storageProvider!: 'local' | 's3';
  @Column('nvarchar', { length: 500 }) storageKey!: string;
  @Column('nvarchar', { length: 255 }) originalFileName!: string;
  @Column('nvarchar', { length: 100 }) contentType!: string;
  @Column({ type: 'bigint' }) sizeBytes!: string;
  @Column('nvarchar', { length: 64 }) sha256Hash!: string;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
  @DeleteDateColumn({ type: 'datetime2', nullable: true }) deletedAtUtc!: Date | null;
}
