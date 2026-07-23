import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CardEntity } from '../cards/entities/card.entity.js';
import { AdmissionController } from './admission.controller.js';
import { AdmissionService } from './admission.service.js';
import { CandidateScoreEntity } from './entities/candidate-score.entity.js';
import { RawInputEntity } from './entities/raw-input.entity.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([RawInputEntity, CandidateScoreEntity, CardEntity])
  ],
  controllers: [AdmissionController],
  providers: [AdmissionService]
})
export class AdmissionModule {}
