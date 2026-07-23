import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';

import { UserEntity } from './user.entity.js';

@Entity({ name: 'refresh_sessions' })
@Index(['familyId'])
export class RefreshSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'NO ACTION' })
  user!: UserEntity;

  @Column('uuid')
  deviceId!: string;

  @Column({ length: 128 })
  tokenHash!: string;

  @Column('uuid')
  familyId!: string;

  @Column({ type: 'datetime2' })
  expiresAtUtc!: Date;

  @Column({ type: 'datetime2', nullable: true })
  revokedAtUtc!: Date | null;

  @Column('uuid', { nullable: true })
  replacedBySessionId!: string | null;

  @CreateDateColumn({ type: 'datetime2' })
  createdAtUtc!: Date;

  @Column({ type: 'datetime2' })
  lastUsedAtUtc!: Date;
}
