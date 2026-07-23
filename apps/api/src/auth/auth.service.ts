import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';

import type { Environment } from '../config/environment.js';
import { DeviceEntity } from './entities/device.entity.js';
import { RefreshSessionEntity } from './entities/refresh-session.entity.js';
import { UserEntity } from './entities/user.entity.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: Pick<
    UserEntity,
    'id' | 'email' | 'timezone' | 'dailyBudgetSeconds' | 'defaultDesiredRetention'
  >;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    @InjectRepository(RefreshSessionEntity)
    private readonly sessions: Repository<RefreshSessionEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Environment, true>
  ) {}

  async register(input: RegisterDto): Promise<AuthResult> {
    const email = input.email.trim();
    const normalizedEmail = email.toLocaleLowerCase('en-US');
    if (await this.users.existsBy({ normalizedEmail })) {
      throw new ConflictException('Email is already registered.');
    }

    const user = await this.users.save(
      this.users.create({
        email,
        normalizedEmail,
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id })
      })
    );
    return this.createSession(user, input);
  }

  async login(input: LoginDto): Promise<AuthResult> {
    const user = await this.users.findOneBy({
      normalizedEmail: input.email.trim().toLocaleLowerCase('en-US')
    });
    if (user === null || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.createSession(user, input);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const [sessionId, secret] = refreshToken.split('.');
    if (sessionId === undefined || secret === undefined) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const session = await this.sessions.findOne({
      where: { id: sessionId },
      relations: { user: true }
    });
    if (
      session === null ||
      !this.matchesToken(session, secret) ||
      session.expiresAtUtc <= new Date()
    ) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    if (session.revokedAtUtc !== null) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Refresh token reuse detected.');
    }

    const replacement = await this.createRefreshSession(
      session.user,
      session.deviceId,
      session.familyId
    );
    session.revokedAtUtc = new Date();
    session.lastUsedAtUtc = new Date();
    session.replacedBySessionId = replacement.id;
    await this.sessions.save(session);

    return this.toAuthResult(session.user, replacement.token);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken === undefined) {
      return;
    }
    const [sessionId] = refreshToken.split('.');
    if (sessionId !== undefined) {
      await this.sessions.update({ id: sessionId }, { revokedAtUtc: new Date() });
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.update({ userId, revokedAtUtc: IsNull() }, { revokedAtUtc: new Date() });
  }

  private async createSession(user: UserEntity, input: RegisterDto): Promise<AuthResult> {
    const now = new Date();
    await this.devices.upsert(
      {
        id: input.deviceId,
        userId: user.id,
        name: input.deviceName.trim(),
        platform: input.platform.trim(),
        lastSeenAtUtc: now
      },
      ['id']
    );
    const session = await this.createRefreshSession(user, input.deviceId, randomUUID());
    return this.toAuthResult(user, session.token);
  }

  private async createRefreshSession(
    user: UserEntity,
    deviceId: string,
    familyId: string
  ): Promise<{ id: string; token: string }> {
    const id = randomUUID();
    const secret = randomBytes(48).toString('base64url');
    const expiresAtUtc = new Date();
    expiresAtUtc.setUTCDate(
      expiresAtUtc.getUTCDate() + this.configService.get('REFRESH_TOKEN_TTL_DAYS', { infer: true })
    );
    await this.sessions.save(
      this.sessions.create({
        id,
        userId: user.id,
        deviceId,
        tokenHash: this.hashToken(secret),
        familyId,
        expiresAtUtc,
        revokedAtUtc: null,
        replacedBySessionId: null,
        lastUsedAtUtc: new Date()
      })
    );
    return { id, token: `${id}.${secret}` };
  }

  private async toAuthResult(user: UserEntity, refreshToken: string): Promise<AuthResult> {
    return {
      accessToken: await this.jwtService.signAsync({ sub: user.id, email: user.email }),
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        timezone: user.timezone,
        dailyBudgetSeconds: user.dailyBudgetSeconds,
        defaultDesiredRetention: Number(user.defaultDesiredRetention)
      }
    };
  }

  private hashToken(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private matchesToken(session: RefreshSessionEntity, secret: string): boolean {
    const expected = Buffer.from(session.tokenHash, 'hex');
    const actual = Buffer.from(this.hashToken(secret), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.sessions.update({ familyId, revokedAtUtc: IsNull() }, { revokedAtUtc: new Date() });
  }
}
