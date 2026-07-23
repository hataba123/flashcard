import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDashboardIndexes1761696000000 implements MigrationInterface {
  name = 'AddDashboardIndexes1761696000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IX_review_logs_user_reviewed_at ON review_logs(userId, reviewedAtUtc);'
    );
    await queryRunner.query(
      'CREATE INDEX IX_cards_user_leech ON cards(userId, isLeech, deletedAtUtc, lapseCount DESC);'
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IX_cards_user_leech ON cards;');
    await queryRunner.query('DROP INDEX IX_review_logs_user_reviewed_at ON review_logs;');
  }
}
