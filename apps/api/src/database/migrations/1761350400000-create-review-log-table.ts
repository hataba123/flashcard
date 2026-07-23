import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewLogTable1761350400000 implements MigrationInterface {
  name = 'CreateReviewLogTable1761350400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE review_logs (
        id uniqueidentifier NOT NULL PRIMARY KEY,
        clientEventId uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        cardId uniqueidentifier NOT NULL,
        sessionId uniqueidentifier NOT NULL,
        deviceId uniqueidentifier NOT NULL,
        eventType nvarchar(16) NOT NULL,
        rating nvarchar(8) NULL,
        shownAtUtc datetime2 NOT NULL,
        revealedAtUtc datetime2 NULL,
        gradedAtUtc datetime2 NOT NULL,
        reviewedAtUtc datetime2 NOT NULL,
        answerLatencyMs int NOT NULL,
        retrievabilityBefore float NOT NULL,
        stabilityBefore float NOT NULL,
        stabilityAfter float NOT NULL,
        difficultyBefore float NOT NULL,
        difficultyAfter float NOT NULL,
        elapsedDaysBefore int NOT NULL,
        elapsedDaysAfter int NOT NULL,
        scheduledDaysBefore int NOT NULL,
        scheduledDaysAfter int NOT NULL,
        learningStepBefore int NOT NULL,
        learningStepAfter int NOT NULL,
        reviewCountBefore int NOT NULL,
        reviewCountAfter int NOT NULL,
        lapseCountBefore int NOT NULL,
        lapseCountAfter int NOT NULL,
        stateBefore nvarchar(20) NOT NULL,
        stateAfter nvarchar(20) NOT NULL,
        dueBeforeUtc datetime2 NOT NULL,
        dueAfterUtc datetime2 NOT NULL,
        lastReviewBeforeUtc datetime2 NULL,
        lastReviewAfterUtc datetime2 NULL,
        cardVersionBefore int NOT NULL,
        cardVersionAfter int NOT NULL,
        serverReceivedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        undoOfReviewLogId uniqueidentifier NULL,
        CONSTRAINT FK_review_logs_user FOREIGN KEY (userId) REFERENCES users(id),
        CONSTRAINT FK_review_logs_card FOREIGN KEY (cardId) REFERENCES cards(id),
        CONSTRAINT FK_review_logs_device FOREIGN KEY (deviceId) REFERENCES devices(id),
        CONSTRAINT FK_review_logs_undo FOREIGN KEY (undoOfReviewLogId) REFERENCES review_logs(id)
      );
      CREATE UNIQUE INDEX UX_review_logs_user_client_event ON review_logs(userId, clientEventId);
      CREATE INDEX IX_review_logs_card_reviewed ON review_logs(cardId, reviewedAtUtc);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE review_logs;');
  }
}
