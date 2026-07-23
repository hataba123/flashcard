import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1761177600000 implements MigrationInterface {
  name = 'CreateAuthTables1761177600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uniqueidentifier NOT NULL PRIMARY KEY,
        email nvarchar(254) NOT NULL,
        normalizedEmail nvarchar(254) NOT NULL,
        passwordHash nvarchar(255) NOT NULL,
        timezone nvarchar(64) NOT NULL CONSTRAINT DF_users_timezone DEFAULT 'UTC',
        dailyBudgetSeconds int NOT NULL CONSTRAINT DF_users_daily_budget DEFAULT 7200,
        defaultDesiredRetention decimal(4,2) NOT NULL CONSTRAINT DF_users_retention DEFAULT 0.86,
        createdAtUtc datetime2 NOT NULL CONSTRAINT DF_users_created DEFAULT SYSUTCDATETIME(),
        updatedAtUtc datetime2 NOT NULL CONSTRAINT DF_users_updated DEFAULT SYSUTCDATETIME()
      );
      CREATE UNIQUE INDEX UX_users_normalizedEmail ON users(normalizedEmail);
    `);
    await queryRunner.query(`
      CREATE TABLE devices (
        id uniqueidentifier NOT NULL PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        name nvarchar(100) NOT NULL,
        platform nvarchar(100) NOT NULL,
        lastSeenAtUtc datetime2 NOT NULL,
        createdAtUtc datetime2 NOT NULL CONSTRAINT DF_devices_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_devices_user FOREIGN KEY (userId) REFERENCES users(id)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE refresh_sessions (
        id uniqueidentifier NOT NULL PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        deviceId uniqueidentifier NOT NULL,
        tokenHash nvarchar(128) NOT NULL,
        familyId uniqueidentifier NOT NULL,
        expiresAtUtc datetime2 NOT NULL,
        revokedAtUtc datetime2 NULL,
        replacedBySessionId uniqueidentifier NULL,
        createdAtUtc datetime2 NOT NULL CONSTRAINT DF_refresh_sessions_created DEFAULT SYSUTCDATETIME(),
        lastUsedAtUtc datetime2 NOT NULL,
        CONSTRAINT FK_refresh_sessions_user FOREIGN KEY (userId) REFERENCES users(id),
        CONSTRAINT FK_refresh_sessions_device FOREIGN KEY (deviceId) REFERENCES devices(id)
      );
      CREATE INDEX IX_refresh_sessions_familyId ON refresh_sessions(familyId);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE refresh_sessions;');
    await queryRunner.query('DROP TABLE devices;');
    await queryRunner.query('DROP TABLE users;');
  }
}
