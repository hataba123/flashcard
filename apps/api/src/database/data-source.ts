import 'reflect-metadata';

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';

import { parseEnvironment } from '../config/environment.js';

const localEnvironmentPath = resolve(process.cwd(), '.env');
config({
  path: existsSync(localEnvironmentPath)
    ? localEnvironmentPath
    : resolve(process.cwd(), '../../.env'),
  quiet: true
});

const environment = parseEnvironment(process.env);

export const appDataSource = new DataSource({
  type: 'mssql',
  host: environment.DB_HOST,
  port: environment.DB_PORT,
  username: environment.DB_USER,
  password: environment.DB_PASSWORD,
  database: environment.DB_NAME,
  synchronize: false,
  migrationsRun: false,
  entities: [environment.NODE_ENV === 'production' ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts'],
  migrations: [
    environment.NODE_ENV === 'production'
      ? 'dist/database/migrations/*.js'
      : 'src/database/migrations/*.ts'
  ],
  options: {
    encrypt: environment.NODE_ENV === 'production',
    trustServerCertificate: environment.NODE_ENV !== 'production'
  }
});
