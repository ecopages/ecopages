/**
 * One-way copy of the knowledge layers (wiki, sources, schema) into an
 * Obsidian vault. The site (`src/`, config, node_modules) is not copied.
 *
 * Run from the app package: `pnpm sync:obsidian`
 *
 * @remarks
 * Self-contained so Node can execute it with type stripping and no bundler.
 * Reads `OBSIDIAN_VAULT_PATH` from the environment or `.env`.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWLEDGE_DIRS = ['wiki', 'sources'];
const KNOWLEDGE_FILES = ['SCHEMA.md', 'AGENTS.md', 'README.md', 'index.md', 'log.md'];

const MIRROR_NOTE = `# llm-wiki (read-only mirror)

One-way copy of the knowledge layers from the llm-wiki repo. Edit in the repo, then run:

\`\`\`bash
pnpm sync:obsidian
\`\`\`

Do not edit mirrored files here — changes will be overwritten on the next sync.
`;

function repoRootFromThisFile(): string {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
}

async function applyEnvFile(filePath: string): Promise<void> {
	let raw: string;
	try {
		raw = await readFile(filePath, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return;
		}
		throw error;
	}

	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}
		const eq = trimmed.indexOf('=');
		if (eq === -1) {
			continue;
		}
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

async function copyIfExists(from: string, to: string): Promise<boolean> {
	try {
		await cp(from, to, { recursive: true });
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

async function main(): Promise<void> {
	const repoRoot = repoRootFromThisFile();
	await applyEnvFile(path.join(repoRoot, 'app', '.env'));
	await applyEnvFile(path.join(repoRoot, '.env'));

	const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
	if (!vaultPath) {
		console.log('sync:obsidian: OBSIDIAN_VAULT_PATH is unset, nothing to sync');
		console.log('sync:obsidian: set it in .env (see .env.example) or export it, then re-run');
		return;
	}

	const subdir = process.env.LLM_WIKI_OBSIDIAN_SUBDIR ?? 'llm-wiki';
	const destDir = path.join(vaultPath, subdir);

	await rm(destDir, { recursive: true, force: true });
	await mkdir(destDir, { recursive: true });

	for (const dir of KNOWLEDGE_DIRS) {
		await copyIfExists(path.join(repoRoot, dir), path.join(destDir, dir));
	}
	for (const file of KNOWLEDGE_FILES) {
		await copyIfExists(path.join(repoRoot, file), path.join(destDir, file));
	}

	await writeFile(path.join(destDir, 'OBSIDIAN_MIRROR.md'), MIRROR_NOTE, 'utf8');
	console.log(`sync:obsidian: synced knowledge layers to ${destDir}`);
}

await main();
