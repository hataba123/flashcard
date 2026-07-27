import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url().default('http://localhost:5556'),
  DB_HOST: z.string().trim().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(1433),
  DB_NAME: z.string().trim().min(1),
  DB_USER: z.string().trim().min(1),
  DB_PASSWORD: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().trim().min(1).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  MEDIA_DRIVER: z.enum(['local', 's3']).default('local'),
  MEDIA_LOCAL_PATH: z.string().trim().min(1).default('./storage/media'),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().trim().min(1).default('us-east-1'),
  S3_BUCKET: z.string().trim().min(1).optional(),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  FORECAST_MONTE_CARLO_RUNS: z.coerce.number().int().min(1).max(1_000).default(300),
  FORECAST_MAX_CARDS: z.coerce.number().int().min(1).max(100_000).default(20_000),
  FORECAST_PROJECTION_CARD_LIMIT: z.coerce.number().int().min(100).max(10_000).default(1_200),
  FORECAST_MAX_DAYS: z.coerce.number().int().min(30).max(730).default(730),
  FORECAST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000)
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: Record<string, string | undefined>): Environment {
  return environmentSchema.parse(input);
}
