import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudyGoalDailyAvailability1785283200000 implements MigrationInterface {
  name = 'AddStudyGoalDailyAvailability1785283200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE study_goal_daily_availability (
        id uniqueidentifier NOT NULL PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        studyGoalId uniqueidentifier NOT NULL,
        studyDate date NOT NULL,
        availableMinutes int NOT NULL,
        createdAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_study_goal_daily_availability_user FOREIGN KEY (userId) REFERENCES users(id),
        CONSTRAINT FK_study_goal_daily_availability_goal FOREIGN KEY (studyGoalId) REFERENCES study_goals(id),
        CONSTRAINT CK_study_goal_daily_availability_minutes CHECK (availableMinutes BETWEEN 1 AND 720),
        CONSTRAINT UQ_study_goal_daily_availability_user_goal_date UNIQUE (userId, studyGoalId, studyDate)
      );
      CREATE INDEX IX_study_goal_daily_availability_lookup
        ON study_goal_daily_availability(userId, studyGoalId, studyDate);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE study_goal_daily_availability;');
  }
}
