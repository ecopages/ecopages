import { execFileSync } from 'node:child_process';
import { fileSystem } from '@ecopages/file-system';

for (const target of ['.eco', 'dist', 'sqlite.db', 'sqlite.db-shm', 'sqlite.db-wal']) {
	await fileSystem.removeAsync(target);
}
await fileSystem.emptyDirAsync('src/images');
await fileSystem.writeAsync('src/images/.gitkeep', '');

for (const script of ['db:migrate', 'db:seed']) {
	execFileSync('pnpm', ['run', script], { stdio: 'inherit' });
}

console.log('Ready. Run `pnpm dev` to start.');
