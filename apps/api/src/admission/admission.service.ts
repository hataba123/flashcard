import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { CardEntity } from '../cards/entities/card.entity.js';
import { CreateRawInputDto } from './dto/admission.dto.js';
import { CandidateScoreEntity } from './entities/candidate-score.entity.js';
import { RawInputEntity, RawInputStatus } from './entities/raw-input.entity.js';

export interface AdmissionSummary {
  reviewCount: number;
  estimatedReviewSeconds: number;
  newCardsAdmitted: number;
  remainingBudgetSeconds: number;
  reasons: string[];
}

@Injectable()
export class AdmissionService {
  constructor(
    @InjectRepository(RawInputEntity) private readonly rawInputs: Repository<RawInputEntity>,
    @InjectRepository(CandidateScoreEntity)
    private readonly scores: Repository<CandidateScoreEntity>,
    @InjectRepository(CardEntity) private readonly cards: Repository<CardEntity>
  ) {}

  async create(userId: string, input: CreateRawInputDto): Promise<RawInputEntity> {
    const contentRaw = input.contentRaw.trim();
    const normalizedHash = this.hash(contentRaw);
    const existing = await this.rawInputs.findOneBy({ userId, normalizedHash });
    if (existing !== null) return existing;
    return this.rawInputs.save(
      this.rawInputs.create({
        userId,
        contentRaw,
        sourceType: input.sourceType,
        sourceMetadataJson:
          input.sourceMetadata === undefined ? null : JSON.stringify(input.sourceMetadata),
        normalizedHash,
        status: RawInputStatus.Pending,
        processedAtUtc: null
      })
    );
  }

  async bulk(userId: string, inputs: CreateRawInputDto[]): Promise<RawInputEntity[]> {
    return Promise.all(inputs.map((input) => this.create(userId, input)));
  }

  list(userId: string): Promise<RawInputEntity[]> {
    return this.rawInputs.find({ where: { userId }, order: { ingestedAtUtc: 'DESC' } });
  }
  backlog(userId: string): Promise<RawInputEntity[]> {
    return this.rawInputs.find({
      where: { userId, status: RawInputStatus.Backlog },
      order: { ingestedAtUtc: 'ASC' }
    });
  }

  async evaluate(userId: string, id: string): Promise<CandidateScoreEntity> {
    const rawInput = await this.requireInput(userId, id);
    const text = rawInput.contentRaw.trim();
    const words = text.split(/\s+/).filter(Boolean);
    const atomicityScore = Math.max(0, Math.min(1, 1 - Math.max(0, words.length - 30) / 100));
    const difficultyPrior = Math.max(0.1, Math.min(0.9, words.length / 80));
    const duplicateScore = 0;
    const priorityScore = atomicityScore * (1 - difficultyPrior / 2);
    const score = this.scores.create({
      rawInputId: rawInput.id,
      priorityScore,
      difficultyPrior,
      atomicityScore,
      duplicateScore,
      estimatedReviewSeconds: Math.max(8, Math.min(45, Math.ceil(words.length / 4) + 8)),
      evaluatedAtUtc: new Date()
    });
    rawInput.status = RawInputStatus.Candidate;
    rawInput.processedAtUtc = new Date();
    rawInput.version += 1;
    await this.rawInputs.save(rawInput);
    return this.scores.save(score);
  }

  async reject(userId: string, id: string): Promise<RawInputEntity> {
    const rawInput = await this.requireInput(userId, id);
    rawInput.status = RawInputStatus.Rejected;
    rawInput.processedAtUtc = new Date();
    rawInput.version += 1;
    return this.rawInputs.save(rawInput);
  }

  async today(userId: string, budgetSeconds = 7200): Promise<AdmissionSummary> {
    const now = new Date();
    const dueCards = await this.cards.find({
      where: { userId, dueAtUtc: LessThanOrEqual(now), suspendedAtUtc: IsNull() }
    });
    const estimatedReviewSeconds = dueCards.reduce(
      (sum, card) => sum + card.estimatedReviewSeconds,
      0
    );
    const remainingBudgetSeconds = Math.max(0, budgetSeconds - estimatedReviewSeconds);
    const reasons: string[] = [];
    if (estimatedReviewSeconds >= budgetSeconds)
      reasons.push('Review backlog reaches the daily time budget.');
    return {
      reviewCount: dueCards.length,
      estimatedReviewSeconds,
      newCardsAdmitted: 0,
      remainingBudgetSeconds,
      reasons
    };
  }

  async run(userId: string, budgetSeconds = 7200): Promise<AdmissionSummary> {
    const summary = await this.today(userId, budgetSeconds);
    if (summary.remainingBudgetSeconds === 0) return summary;
    const candidates = await this.rawInputs
      .createQueryBuilder('raw')
      .innerJoinAndSelect(CandidateScoreEntity, 'score', 'score.rawInputId = raw.id')
      .where('raw.userId = :userId', { userId })
      .andWhere('raw.status = :status', { status: RawInputStatus.Candidate })
      .orderBy('score.priorityScore', 'DESC')
      .getMany();
    let remaining = summary.remainingBudgetSeconds;
    for (const candidate of candidates) {
      const score = await this.scores.findOneBy({ rawInputId: candidate.id });
      if (score === null || score.estimatedReviewSeconds > remaining) {
        candidate.status = RawInputStatus.Backlog;
        await this.rawInputs.save(candidate);
        continue;
      }
      candidate.status = RawInputStatus.Admitted;
      candidate.processedAtUtc = new Date();
      candidate.version += 1;
      remaining -= score.estimatedReviewSeconds;
      summary.newCardsAdmitted += 1;
      await this.rawInputs.save(candidate);
    }
    summary.remainingBudgetSeconds = remaining;
    if (summary.newCardsAdmitted === 0 && candidates.length > 0)
      summary.reasons.push('Candidate estimates exceed the remaining daily budget.');
    return summary;
  }

  private async requireInput(userId: string, id: string): Promise<RawInputEntity> {
    const rawInput = await this.rawInputs.findOneBy({ id, userId });
    if (rawInput === null) throw new NotFoundException('Raw input not found.');
    return rawInput;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value.toLocaleLowerCase()).digest('hex');
  }
}
