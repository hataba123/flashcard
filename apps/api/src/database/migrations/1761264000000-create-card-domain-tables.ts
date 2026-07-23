import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCardDomainTables1761264000000 implements MigrationInterface {
  name = 'CreateCardDomainTables1761264000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE decks (id uniqueidentifier NOT NULL PRIMARY KEY, userId uniqueidentifier NOT NULL, name nvarchar(200) NOT NULL, description nvarchar(MAX) NULL, desiredRetention decimal(4,2) NOT NULL DEFAULT 0.86, priorityWeight decimal(8,2) NOT NULL DEFAULT 1, dailyNewCardLimit int NOT NULL DEFAULT 20, isCore bit NOT NULL DEFAULT 0, isArchived bit NOT NULL DEFAULT 0, version int NOT NULL DEFAULT 1, createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), deletedAtUtc datetime2 NULL, CONSTRAINT FK_decks_user FOREIGN KEY (userId) REFERENCES users(id)); CREATE INDEX IX_decks_user_deleted ON decks(userId, deletedAtUtc);`
    );
    await queryRunner.query(
      `CREATE TABLE notes (id uniqueidentifier NOT NULL PRIMARY KEY, userId uniqueidentifier NOT NULL, deckId uniqueidentifier NOT NULL, noteType nvarchar(30) NOT NULL, fieldsJson nvarchar(MAX) NOT NULL, tagsJson nvarchar(MAX) NOT NULL DEFAULT '[]', sourceId nvarchar(100) NULL, normalizedHash nvarchar(64) NOT NULL, version int NOT NULL DEFAULT 1, createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), deletedAtUtc datetime2 NULL, CONSTRAINT FK_notes_user FOREIGN KEY (userId) REFERENCES users(id), CONSTRAINT FK_notes_deck FOREIGN KEY (deckId) REFERENCES decks(id)); CREATE INDEX IX_notes_user_deck_deleted ON notes(userId, deckId, deletedAtUtc);`
    );
    await queryRunner.query(
      `CREATE TABLE cards (id uniqueidentifier NOT NULL PRIMARY KEY, userId uniqueidentifier NOT NULL, noteId uniqueidentifier NOT NULL, deckId uniqueidentifier NOT NULL, templateOrdinal int NOT NULL, state nvarchar(20) NOT NULL DEFAULT 'New', dueAtUtc datetime2 NOT NULL, lastReviewAtUtc datetime2 NULL, stability float NOT NULL DEFAULT 0, difficulty float NOT NULL DEFAULT 0, elapsedDays int NOT NULL DEFAULT 0, scheduledDays int NOT NULL DEFAULT 0, learningStep int NOT NULL DEFAULT 0, reviewCount int NOT NULL DEFAULT 0, lapseCount int NOT NULL DEFAULT 0, priorityWeight decimal(8,2) NOT NULL DEFAULT 1, importanceWeight decimal(8,2) NOT NULL DEFAULT 1, estimatedReviewSeconds int NOT NULL DEFAULT 12, isLeech bit NOT NULL DEFAULT 0, suspendedAtUtc datetime2 NULL, version int NOT NULL DEFAULT 1, createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), deletedAtUtc datetime2 NULL, CONSTRAINT FK_cards_user FOREIGN KEY (userId) REFERENCES users(id), CONSTRAINT FK_cards_note FOREIGN KEY (noteId) REFERENCES notes(id), CONSTRAINT FK_cards_deck FOREIGN KEY (deckId) REFERENCES decks(id), CONSTRAINT UQ_cards_note_template UNIQUE(noteId, templateOrdinal)); CREATE INDEX IX_cards_queue ON cards(userId, dueAtUtc, state, suspendedAtUtc);`
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE cards; DROP TABLE notes; DROP TABLE decks;');
  }
}
