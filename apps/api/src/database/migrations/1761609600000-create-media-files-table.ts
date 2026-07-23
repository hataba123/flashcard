import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateMediaFilesTable1761609600000 implements MigrationInterface {
  name = 'CreateMediaFilesTable1761609600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE media_files (id uniqueidentifier NOT NULL PRIMARY KEY, userId uniqueidentifier NOT NULL, storageProvider nvarchar(20) NOT NULL, storageKey nvarchar(500) NOT NULL, originalFileName nvarchar(255) NOT NULL, contentType nvarchar(100) NOT NULL, sizeBytes bigint NOT NULL, sha256Hash nvarchar(64) NOT NULL, createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), deletedAtUtc datetime2 NULL, CONSTRAINT FK_media_files_user FOREIGN KEY (userId) REFERENCES users(id)); CREATE INDEX IX_media_files_user_hash ON media_files(userId, sha256Hash);`
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE media_files;');
  }
}
