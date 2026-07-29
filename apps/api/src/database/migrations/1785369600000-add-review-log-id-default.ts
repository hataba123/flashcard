import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewLogIdDefault1785369600000 implements MigrationInterface {
  name = 'AddReviewLogIdDefault1785369600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE review_logs
      ADD CONSTRAINT DF_review_logs_id DEFAULT NEWSEQUENTIALID() FOR id;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE review_logs DROP CONSTRAINT DF_review_logs_id;
    `);
  }
}
