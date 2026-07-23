import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { parseEnvironment } from '../config/environment.js';

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
