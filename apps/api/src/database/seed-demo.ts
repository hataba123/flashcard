import 'reflect-metadata';

import argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';

import { UserEntity } from '../auth/entities/user.entity.js';
import { CardEntity, CardState } from '../cards/entities/card.entity.js';
import { DeckEntity } from '../cards/entities/deck.entity.js';
import { NoteEntity } from '../cards/entities/note.entity.js';
import { appDataSource } from './data-source.js';

const demoEmail = process.env.SEED_DEMO_EMAIL ?? 'demo@flashcard.local';
const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'DemoPassword123!';
const demoDeckName = 'Demo — Kiến thức nền tảng';

async function seedDemo(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed cannot run in production.');
  }

  await appDataSource.initialize();
  try {
    await appDataSource.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);
      const decks = manager.getRepository(DeckEntity);
      const notes = manager.getRepository(NoteEntity);
      const cards = manager.getRepository(CardEntity);
      const normalizedEmail = demoEmail.trim().toLocaleLowerCase('en-US');

      let user = await users.findOneBy({ normalizedEmail });
      if (user === null) {
        user = await users.save(
          users.create({
            id: randomUUID(),
            email: demoEmail.trim(),
            normalizedEmail,
            passwordHash: await argon2.hash(demoPassword, { type: argon2.argon2id }),
            timezone: 'UTC',
            dailyBudgetSeconds: 7200,
            defaultDesiredRetention: 0.86
          })
        );
      }

      let deck = await decks.findOneBy({ userId: user.id, name: demoDeckName });
      if (deck === null) {
        deck = await decks.save(
          decks.create({
            id: randomUUID(),
            userId: user.id,
            name: demoDeckName,
            description: 'Dữ liệu mẫu an toàn cho môi trường local.',
            desiredRetention: 0.86,
            priorityWeight: 1,
            dailyNewCardLimit: 20,
            isCore: true,
            isArchived: false,
            version: 1,
            deletedAtUtc: null
          })
        );
      }

      const fields = {
        front: 'Spaced repetition là gì?',
        back: 'Ôn lại đúng lúc để ghi nhớ lâu hơn.'
      };
      const fieldsJson = JSON.stringify(fields);
      const normalizedHash = createHash('sha256').update(`Basic:${fieldsJson}`).digest('hex');
      let note = await notes.findOneBy({ userId: user.id, normalizedHash });
      if (note === null) {
        note = await notes.save(
          notes.create({
            id: randomUUID(),
            userId: user.id,
            deckId: deck.id,
            noteType: 'Basic',
            fieldsJson,
            tagsJson: JSON.stringify(['demo', 'learning']),
            sourceId: 'seed-demo',
            normalizedHash,
            version: 1,
            deletedAtUtc: null
          })
        );
      }

      const existingCard = await cards.findOneBy({ noteId: note.id, templateOrdinal: 0 });
      if (existingCard === null) {
        await cards.save(
          cards.create({
            id: randomUUID(),
            userId: user.id,
            noteId: note.id,
            deckId: deck.id,
            templateOrdinal: 0,
            state: CardState.New,
            dueAtUtc: new Date(),
            lastReviewAtUtc: null,
            suspendedAtUtc: null,
            deletedAtUtc: null
          })
        );
      }
    });
  } finally {
    await appDataSource.destroy();
  }
}

void seedDemo();
