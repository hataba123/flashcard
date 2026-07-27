import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'import_batches' })
export class ImportBatchEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('uuid') deckId!: string;
  @Column({ type: 'nvarchar', length: 20 }) status!: 'Completed' | 'Undone';
  @Column({ type: 'nvarchar', length: 'MAX' }) itemsJson!: string;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
  @Column({ type: 'datetime2', nullable: true }) undoneAtUtc!: Date | null;
}
