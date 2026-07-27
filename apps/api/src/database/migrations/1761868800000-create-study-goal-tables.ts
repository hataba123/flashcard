import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStudyGoalTables1761868800000 implements MigrationInterface {
  name = 'CreateStudyGoalTables1761868800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE study_goals (
        id uniqueidentifier NOT NULL PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        name nvarchar(200) NOT NULL,
        goalType nvarchar(20) NOT NULL,
        targetDate date NOT NULL,
        dailyStudyMinutes int NOT NULL,
        studyDaysOfWeekJson nvarchar(30) NOT NULL,
        desiredRetention decimal(4,2) NOT NULL,
        finalReviewDays int NOT NULL,
        maxNewCardsPerDay int NOT NULL,
        timeZone nvarchar(100) NOT NULL,
        status nvarchar(20) NOT NULL DEFAULT 'Active',
        version int NOT NULL DEFAULT 1,
        createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_study_goals_user FOREIGN KEY (userId) REFERENCES users(id)
      );
      CREATE INDEX IX_study_goals_user_status ON study_goals(userId, status);
      CREATE INDEX IX_study_goals_user_target ON study_goals(userId, targetDate);

      CREATE TABLE study_goal_decks (
        studyGoalId uniqueidentifier NOT NULL,
        deckId uniqueidentifier NOT NULL,
        priorityWeight decimal(8,2) NOT NULL DEFAULT 1,
        createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_study_goal_decks PRIMARY KEY (studyGoalId, deckId),
        CONSTRAINT FK_study_goal_decks_goal FOREIGN KEY (studyGoalId) REFERENCES study_goals(id),
        CONSTRAINT FK_study_goal_decks_deck FOREIGN KEY (deckId) REFERENCES decks(id)
      );
      CREATE INDEX IX_study_goal_decks_deck ON study_goal_decks(deckId);

      CREATE TABLE forecast_snapshots (
        id uniqueidentifier NOT NULL PRIMARY KEY,
        studyGoalId uniqueidentifier NOT NULL,
        calculatedAtUtc datetime2 NOT NULL,
        algorithmVersion nvarchar(30) NOT NULL,
        inputHash nvarchar(64) NOT NULL,
        predictedNewCardsCompletedDate date NULL,
        predictedCompletionP50Date date NULL,
        predictedCompletionP80Date date NULL,
        predictedCompletionP90Date date NULL,
        probabilityBeforeTarget float NOT NULL,
        requiredDailyMinutes float NOT NULL,
        averageNewCardsPerDay float NOT NULL,
        averageReviewsPerDay float NOT NULL,
        overloadDays int NOT NULL,
        confidenceLevel nvarchar(10) NOT NULL,
        feasibility nvarchar(20) NOT NULL,
        totalCards int NOT NULL,
        newCards int NOT NULL,
        learningCards int NOT NULL,
        stableCards int NOT NULL,
        daysRemaining int NOT NULL,
        dailyProjectionJson nvarchar(MAX) NOT NULL,
        recommendationsJson nvarchar(MAX) NOT NULL,
        scenariosJson nvarchar(MAX) NOT NULL,
        createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_forecast_snapshots_goal FOREIGN KEY (studyGoalId) REFERENCES study_goals(id)
      );
      CREATE INDEX IX_forecast_snapshots_goal_calculated ON forecast_snapshots(studyGoalId, calculatedAtUtc DESC);
      CREATE INDEX IX_forecast_snapshots_goal_hash ON forecast_snapshots(studyGoalId, inputHash);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE forecast_snapshots; DROP TABLE study_goal_decks; DROP TABLE study_goals;'
    );
  }
}
