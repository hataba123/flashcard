import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdmissionTables1761436800000 implements MigrationInterface {
  name = 'CreateAdmissionTables1761436800000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE raw_inputs (
        id uniqueidentifier NOT NULL PRIMARY KEY, userId uniqueidentifier NOT NULL, contentRaw nvarchar(MAX) NOT NULL,
        sourceType nvarchar(50) NOT NULL, sourceMetadataJson nvarchar(MAX) NULL, normalizedHash nvarchar(64) NOT NULL,
        status nvarchar(20) NOT NULL, ingestedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), processedAtUtc datetime2 NULL,
        version int NOT NULL DEFAULT 1, updatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), deletedAtUtc datetime2 NULL,
        CONSTRAINT FK_raw_inputs_user FOREIGN KEY (userId) REFERENCES users(id)
      );
      CREATE UNIQUE INDEX UX_raw_inputs_user_hash ON raw_inputs(userId, normalizedHash);
      CREATE INDEX IX_raw_inputs_user_status ON raw_inputs(userId, status, deletedAtUtc);
      CREATE TABLE candidate_scores (
        rawInputId uniqueidentifier NOT NULL PRIMARY KEY, priorityScore float NOT NULL, difficultyPrior float NOT NULL,
        atomicityScore float NOT NULL, duplicateScore float NOT NULL, estimatedReviewSeconds int NOT NULL, evaluatedAtUtc datetime2 NOT NULL,
        CONSTRAINT FK_candidate_scores_raw_input FOREIGN KEY (rawInputId) REFERENCES raw_inputs(id) ON DELETE CASCADE
      );
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE candidate_scores; DROP TABLE raw_inputs;');
  }
}
