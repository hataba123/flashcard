import { appDataSource } from './data-source.js';

async function runMigrations(): Promise<void> {
  await appDataSource.initialize();
  await appDataSource.runMigrations();
  await appDataSource.destroy();
}

void runMigrations();
