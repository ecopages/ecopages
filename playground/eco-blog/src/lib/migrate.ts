import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { db } from './shared-db';
import { logger } from './logger';

try {
	logger.info('Running migrations...');
	migrate(db, { migrationsFolder: './drizzle' });
	logger.info('Migrations completed successfully');
} catch (error) {
	const errorMessage = error instanceof Error ? error.message : String(error);
	logger.error('Migration failed:', errorMessage);
	process.exit(1);
}
