import { resolve } from 'node:path';
import { fileSystem } from '@ecopages/file-system';

const stage = resolve('.desktop-runtime');
const manifest = fileSystem.readFileSync('package.json');

const dependencyBlocks = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
const parsedManifest: Partial<Record<(typeof dependencyBlocks)[number], Record<string, string>>> = JSON.parse(manifest);
if (
	dependencyBlocks.some((block) => Object.values(parsedManifest[block] ?? {}).some((v) => v.startsWith('workspace:')))
) {
	throw new Error(
		'Package the desktop app from a scaffolded, standalone project. Use pnpm desktop:dev in the monorepo.',
	);
}

const lockfile = fileSystem.readFileSync('pnpm-lock.yaml');
const workspaceConfig = 'pnpm-workspace.yaml';
fileSystem.ensureDir(stage, true);
fileSystem.write(resolve(stage, 'package.json'), manifest);
fileSystem.write(resolve(stage, 'pnpm-lock.yaml'), lockfile);
fileSystem.write(
	resolve(stage, workspaceConfig),
	fileSystem.exists(workspaceConfig) ? fileSystem.readFileSync(workspaceConfig) : 'packages: []\n',
);

const install = Bun.spawn(['pnpm', 'install', '--prod', '--frozen-lockfile', '--node-linker=hoisted'], {
	cwd: stage,
	stdout: 'inherit',
	stderr: 'inherit',
});
if (await install.exited) throw new Error('Could not stage the desktop runtime dependencies.');
