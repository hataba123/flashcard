import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from '@aws-sdk/client-s3';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Repository } from 'typeorm';
import { MediaFileEntity } from './entities/media-file.entity.js';

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav'
]);
const maxBytes = 20 * 1024 * 1024;
export interface UploadedMedia {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaFileEntity) private readonly files: Repository<MediaFileEntity>
  ) {}
  async upload(userId: string, file: UploadedMedia | undefined): Promise<MediaFileEntity> {
    if (file === undefined) throw new BadRequestException('A media file is required.');
    if (
      file.size > maxBytes ||
      !allowedTypes.has(file.mimetype) ||
      !this.hasExpectedSignature(file.buffer, file.mimetype)
    )
      throw new BadRequestException('Unsupported or invalid media file.');
    const sha256Hash = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.files.findOneBy({ userId, sha256Hash });
    if (existing !== null) return existing;
    const extension = this.extension(file.mimetype);
    const storageKey = `${randomUUID()}.${extension}`;
    if (this.driver === 'local') {
      const root = resolve(process.env.MEDIA_LOCAL_PATH ?? './storage/media');
      await mkdir(root, { recursive: true });
      await writeFile(join(root, storageKey), file.buffer, { flag: 'wx' });
    } else {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype
        })
      );
    }
    return this.files.save(
      this.files.create({
        userId,
        storageProvider: this.driver,
        storageKey,
        originalFileName: file.originalname,
        contentType: file.mimetype,
        sizeBytes: String(file.size),
        sha256Hash
      })
    );
  }
  async read(userId: string, id: string): Promise<{ file: MediaFileEntity; data: Buffer }> {
    const file = await this.require(userId, id);
    if (file.storageProvider === 'local')
      return { file, data: await readFile(this.path(file.storageKey)) };
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: file.storageKey })
    );
    if (response.Body === undefined) throw new NotFoundException('Media data not found.');
    return { file, data: Buffer.from(await response.Body.transformToByteArray()) };
  }
  async remove(userId: string, id: string): Promise<void> {
    const file = await this.require(userId, id);
    file.deletedAtUtc = new Date();
    await this.files.save(file);
  }
  private async require(userId: string, id: string): Promise<MediaFileEntity> {
    const file = await this.files.findOneBy({ id, userId });
    if (file === null) throw new NotFoundException('Media file not found.');
    return file;
  }
  private path(storageKey: string): string {
    return join(resolve(process.env.MEDIA_LOCAL_PATH ?? './storage/media'), storageKey);
  }
  private get driver(): 'local' | 's3' {
    return process.env.MEDIA_DRIVER === 's3' ? 's3' : 'local';
  }
  private get bucket(): string {
    if (process.env.S3_BUCKET === undefined)
      throw new BadRequestException('S3_BUCKET is required for S3 storage.');
    return process.env.S3_BUCKET;
  }
  private get s3(): S3Client {
    const config: S3ClientConfig = {
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false'
    };
    if (process.env.S3_ENDPOINT !== undefined) config.endpoint = process.env.S3_ENDPOINT;
    if (process.env.S3_ACCESS_KEY !== undefined && process.env.S3_SECRET_KEY !== undefined)
      config.credentials = {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
      };
    return new S3Client(config);
  }
  private extension(type: string): string {
    return (
      {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/ogg': 'ogg',
        'audio/wav': 'wav'
      }[type] ?? 'bin'
    );
  }
  private hasExpectedSignature(data: Buffer, type: string): boolean {
    const hex = data.subarray(0, 12).toString('hex');
    if (type === 'image/jpeg') return hex.startsWith('ffd8ff');
    if (type === 'image/png') return hex.startsWith('89504e470d0a1a0a');
    if (type === 'image/webp')
      return (
        data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP'
      );
    if (type === 'audio/mpeg') return hex.startsWith('494433') || hex.startsWith('fffb');
    if (type === 'audio/ogg') return data.subarray(0, 4).toString() === 'OggS';
    if (type === 'audio/wav')
      return (
        data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WAVE'
      );
    return type === 'audio/mp4' && data.subarray(4, 8).toString() === 'ftyp';
  }
}
