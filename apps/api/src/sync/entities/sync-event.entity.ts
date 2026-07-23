import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sync_events' })
@Index(['userId', 'sequence'])
@Index(['userId', 'clientEventId'], { unique: true, where: 'clientEventId IS NOT NULL' })
export class SyncEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' }) sequence!: string;
  @Column('uuid') userId!: string;
  @Column({ length: 50 }) entityType!: string;
  @Column('uuid') entityId!: string;
  @Column({ length: 16 }) operation!: 'Created' | 'Updated' | 'Deleted';
  @Column({ type: 'int' }) entityVersion!: number;
  @Column({ type: 'nvarchar', length: 'MAX' }) payloadJson!: string;
  @Column('uuid', { nullable: true }) deviceId!: string | null;
  @Column('uuid', { nullable: true }) clientEventId!: string | null;
  @CreateDateColumn({ type: 'datetime2' }) serverCreatedAtUtc!: Date;
}
