import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn } from 'typeorm';

import { UserEntity } from './user.entity.js';

@Entity({ name: 'devices' })
export class DeviceEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'NO ACTION' })
  user!: UserEntity;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 100 })
  platform!: string;

  @Column({ type: 'datetime2' })
  lastSeenAtUtc!: Date;

  @CreateDateColumn({ type: 'datetime2' })
  createdAtUtc!: Date;
}
