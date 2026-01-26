import { $ } from 'bun';
import { logger } from '../src/lib/logger';
import { fileSystem } from '@ecopages/file-system';

const dirsToRemove = ['node_modules', '.eco', 'drizzle'];
const filesToRemove = ['sqlite.db', 'sqlite.db-shm', 'sqlite.db-wal', 'bun.lockb'];
const dirToEmpty = ['src/images'];

logger.info('Cleaning up project...');

for (const dir of dirsToRemove) {
	await fileSystem.removeAsync(dir);
}

for (const dir of dirToEmpty) {
	await fileSystem.emptyDirAsync(dir);
}

for (const file of filesToRemove) {
	await fileSystem.removeAsync(file);
}

logger.info('Project cleaned. Reinstalling and setting up...');

await $`bun install`;
await $`bun db:generate`;
await $`bun db:migrate`;
await $`bun db:seed`;

logger.info('Ready to go! Run `bun dev` to start.');
