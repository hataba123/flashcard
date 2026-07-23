import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSyncEventsTable1761523200000 implements MigrationInterface {
  name = 'CreateSyncEventsTable1761523200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sync_events (
        sequence bigint IDENTITY(1,1) NOT NULL PRIMARY KEY, userId uniqueidentifier NOT NULL, entityType nvarchar(50) NOT NULL,
        entityId uniqueidentifier NOT NULL, operation nvarchar(16) NOT NULL, entityVersion int NOT NULL, payloadJson nvarchar(MAX) NOT NULL,
        deviceId uniqueidentifier NULL, clientEventId uniqueidentifier NULL, serverCreatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_sync_events_user FOREIGN KEY (userId) REFERENCES users(id)
      );
      CREATE INDEX IX_sync_events_user_sequence ON sync_events(userId, sequence);
      CREATE UNIQUE INDEX UX_sync_events_user_client_event ON sync_events(userId, clientEventId) WHERE clientEventId IS NOT NULL;
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE sync_events;');
  }
}
