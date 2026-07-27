import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImportBatches1761782400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE import_batches (id uniqueidentifier NOT NULL PRIMARY KEY, userId uniqueidentifier NOT NULL, deckId uniqueidentifier NOT NULL, status nvarchar(20) NOT NULL, itemsJson nvarchar(MAX) NOT NULL, createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), undoneAtUtc datetime2 NULL, CONSTRAINT FK_import_batches_user FOREIGN KEY (userId) REFERENCES users(id), CONSTRAINT FK_import_batches_deck FOREIGN KEY (deckId) REFERENCES decks(id)); CREATE INDEX IX_import_batches_latest ON import_batches(userId, deckId, status, createdAtUtc DESC);`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE import_batches'); }
}
