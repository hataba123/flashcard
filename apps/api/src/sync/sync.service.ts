import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { PushSyncEventDto } from './dto/sync.dto.js';
import { SyncEventEntity } from './entities/sync-event.entity.js';
import { SyncGateway } from './sync.gateway.js';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(SyncEventEntity) private readonly events: Repository<SyncEventEntity>,
    private readonly gateway: SyncGateway
  ) {}
  async push(userId: string, inputs: PushSyncEventDto[]): Promise<SyncEventEntity[]> {
    const results: SyncEventEntity[] = [];
    for (const input of inputs) {
      const existing = await this.events.findOneBy({ userId, clientEventId: input.clientEventId });
      if (existing !== null) {
        results.push(existing);
        continue;
      }
      const event = await this.events.save(
        this.events.create({
          userId,
          entityType: input.entityType,
          entityId: input.entityId,
          operation: input.operation,
          entityVersion: input.entityVersion,
          payloadJson: JSON.stringify(input.payload),
          deviceId: input.deviceId ?? null,
          clientEventId: input.clientEventId
        })
      );
      results.push(event);
      this.gateway.publish(userId, Number(event.sequence));
    }
    return results;
  }
  async pull(userId: string, cursor = 0, limit = 500) {
    const events = await this.events.find({
      where: { userId, sequence: MoreThan(String(cursor)) },
      order: { sequence: 'ASC' },
      take: limit + 1
    });
    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;
    const nextCursor = page.length === 0 ? cursor : Number(page.at(-1)?.sequence);
    return {
      nextCursor,
      hasMore,
      events: page.map((event) => ({
        ...event,
        sequence: Number(event.sequence),
        payload: JSON.parse(event.payloadJson) as Record<string, unknown>
      })),
      serverTimeUtc: new Date().toISOString()
    };
  }
  async status(userId: string) {
    const latest = await this.events.findOne({ where: { userId }, order: { sequence: 'DESC' } });
    return {
      cursor: latest === null ? 0 : Number(latest.sequence),
      serverTimeUtc: new Date().toISOString()
    };
  }
}
