import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

@Entity({ name: 'users' })
@Index(['normalizedEmail'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 254 })
  email!: string;

  @Column({ length: 254 })
  normalizedEmail!: string;

  @Column({ length: 255 })
  passwordHash!: string;

  @Column({ length: 64, default: 'UTC' })
  timezone!: string;

  @Column({ type: 'int', default: 7200 })
  dailyBudgetSeconds!: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0.86 })
  defaultDesiredRetention!: number;

  @CreateDateColumn({ type: 'datetime2' })
  createdAtUtc!: Date;

  @UpdateDateColumn({ type: 'datetime2' })
  updatedAtUtc!: Date;
}
