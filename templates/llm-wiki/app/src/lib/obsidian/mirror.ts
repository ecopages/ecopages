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
import { isEnoent } from '../wiki/is-enoent.ts';
import { resolveChildDirectory, assertDirectoryTarget } from '../safe-directory.ts';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KNOWLEDGE_DIRS = ['wiki', 'sources'];
const KNOWLEDGE_FILES = ['SCHEMA.md', 'AGENTS.md', 'README.md', 'index.md', 'log.md'];

const MIRROR_NOTE = `# llm-wiki (read-only mirror)

One-way copy of the knowledge layers from the llm-wiki repo. Edit in the repo, then run:

\`\`\`bash
pnpm sync:obsidian
\`\`\`

Do not edit mirrored files here — a file that already exists is replaced on the next sync.
Files that are not part of this copy are left in place.
`;

function repoRootFromThisFile(): string {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
}

async function applyEnvFile(filePath: string): Promise<void> {
	let raw: string;
	try {
		raw = await readFile(filePath, 'utf8');
	} catch (error) {
		if (isEnoent(error)) {
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
		await cp(from, to, { recursive: true, force: true });
		return true;
	} catch (error) {
		if (isEnoent(error)) {
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
	const destDir = resolveChildDirectory(vaultPath, subdir);
	await mirrorKnowledgeLayers(repoRoot, destDir);
	console.log(`sync:obsidian: synced knowledge layers to ${destDir}`);
}

/**
 * Copies wiki knowledge files into `destDir`.
 *
 * @remarks
 * Replaces a destination file when the same path already exists. Does not delete
 * `destDir` or files this sync does not copy. A destination of `.` is rejected by
 * {@link resolveChildDirectory} before this runs, because that path is the
 * vault itself.
 */
export async function mirrorKnowledgeLayers(repoRoot: string, destDir: string): Promise<void> {
	const destination = assertDirectoryTarget(destDir);
	await mkdir(destination, { recursive: true });

	for (const dir of KNOWLEDGE_DIRS) {
		await copyIfExists(path.join(repoRoot, dir), path.join(destination, dir));
	}
	for (const file of KNOWLEDGE_FILES) {
		await copyIfExists(path.join(repoRoot, file), path.join(destination, file));
	}

	await writeFile(path.join(destination, 'OBSIDIAN_MIRROR.md'), MIRROR_NOTE, 'utf8');
}

function isDirectExecution(): boolean {
	const entry = process.argv[1];
	if (!entry) {
		return false;
	}
	return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectExecution()) {
	await main();
}
