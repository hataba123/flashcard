import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CascadeDeletedDeckContent1785456000000 implements MigrationInterface {
  name = 'CascadeDeletedDeckContent1785456000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DECLARE @deletedNotes TABLE (
        id uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        version int NOT NULL
      );

      UPDATE note
      SET deletedAtUtc = SYSUTCDATETIME(),
          updatedAtUtc = SYSUTCDATETIME(),
          version = note.version + 1
      OUTPUT inserted.id, inserted.userId, inserted.version INTO @deletedNotes
      FROM notes AS note
      INNER JOIN decks AS deck ON deck.id = note.deckId
      WHERE note.deletedAtUtc IS NULL
        AND deck.deletedAtUtc IS NOT NULL;

      INSERT INTO sync_events (userId, entityType, entityId, operation, entityVersion, payloadJson, deviceId, clientEventId)
      SELECT userId, 'note', id, 'Deleted', version, '{}', NULL, NULL
      FROM @deletedNotes;

      DECLARE @deletedCards TABLE (
        id uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        version int NOT NULL
      );

      UPDATE card
      SET deletedAtUtc = SYSUTCDATETIME(),
          updatedAtUtc = SYSUTCDATETIME(),
          version = card.version + 1
      OUTPUT inserted.id, inserted.userId, inserted.version INTO @deletedCards
      FROM cards AS card
      INNER JOIN decks AS deck ON deck.id = card.deckId
      WHERE card.deletedAtUtc IS NULL
        AND deck.deletedAtUtc IS NOT NULL;

      INSERT INTO sync_events (userId, entityType, entityId, operation, entityVersion, payloadJson, deviceId, clientEventId)
      SELECT userId, 'card', id, 'Deleted', version, '{}', NULL, NULL
      FROM @deletedCards;
    `);
  }

  async down(): Promise<void> {
    throw new Error('This data cleanup migration cannot be reverted safely.');
  }
}
