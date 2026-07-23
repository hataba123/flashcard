import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

import type { NoteType } from '@flashcard/contracts';

@Entity({ name: 'notes' })
@Index(['userId', 'deckId', 'deletedAtUtc'])
export class NoteEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('uuid') deckId!: string;
  @Column({ length: 30 }) noteType!: NoteType;
  @Column({ type: 'nvarchar', length: 'MAX' }) fieldsJson!: string;
  @Column({ type: 'nvarchar', length: 'MAX', default: '[]' }) tagsJson!: string;
  @Column({ length: 100, nullable: true }) sourceId!: string | null;
  @Column({ length: 64 }) normalizedHash!: string;
  @Column({ type: 'int', default: 1 }) version!: number;
  @CreateDateColumn({ type: 'datetime2' }) createdAtUtc!: Date;
  @UpdateDateColumn({ type: 'datetime2' }) updatedAtUtc!: Date;
  @DeleteDateColumn({ type: 'datetime2', nullable: true }) deletedAtUtc!: Date | null;
}
