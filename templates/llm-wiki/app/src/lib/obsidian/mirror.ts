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
import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertDirectoryTarget, resolveChildDirectory } from '../safe-directory.ts';
import { isEnoent } from '../wiki/is-enoent.ts';

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

	const vaultPath = requireObsidianVaultPath();
	const subdir = process.env.LLM_WIKI_OBSIDIAN_SUBDIR ?? 'llm-wiki';
	const destDir = resolveChildDirectory(vaultPath, subdir);
	const mode = await promptObsidianCopy(destDir);
	if (mode === 'skip') {
		return;
	}

	await mirrorKnowledgeLayers(repoRoot, destDir, { replaceDirectory: mode === 'full' });
	outro(mode === 'full' ? `Replaced ${destDir}` : `Copied to ${destDir}`);
}

/**
 * Environment values this command reads. The index signature accepts `process.env`,
 * whose known keys do not include `OBSIDIAN_VAULT_PATH`.
 */
type ObsidianVaultEnv = {
	OBSIDIAN_VAULT_PATH?: string;
	[key: string]: string | undefined;
};

/**
 * @throws When `OBSIDIAN_VAULT_PATH` is missing from the environment.
 */
export function requireObsidianVaultPath(env: ObsidianVaultEnv = process.env): string {
	const vaultPath = env.OBSIDIAN_VAULT_PATH;
	if (!vaultPath) {
		throw new Error('OBSIDIAN_VAULT_PATH is unset. Set it in .env or the environment.');
	}
	return vaultPath;
}

export type ObsidianCopyMode = 'replace-files' | 'full' | 'skip';

/**
 * Asks whether to copy, then whether to delete the destination first.
 *
 * @remarks
 * `--yes` skips both questions and copies without clearing the directory.
 * `--clear` deletes the destination before copying. With `--yes`, that happens
 * without a prompt. Without a terminal, the copy is refused unless `--yes` is set.
 */
export async function promptObsidianCopy(destination: string): Promise<ObsidianCopyMode> {
	const yes = process.argv.includes('--yes');
	const clear = process.argv.includes('--clear');
	if (yes) {
		return clear ? 'full' : 'replace-files';
	}
	if (!process.stdout.isTTY) {
		log.error('No terminal. Re-run with --yes to copy without a prompt.');
		process.exitCode = 1;
		return 'skip';
	}

	intro('Copy into Obsidian');
	note(obsidianCopyMessage(destination), 'Confirm the directory');
	const copy = await confirm({ message: 'Copy these files into that directory?' });
	if (isCancel(copy) || !copy) {
		cancel('Nothing was copied.');
		return 'skip';
	}
	if (clear) {
		return 'full';
	}

	const replaceDirectory = await confirm({
		message: `Clear ${destination} before copying?`,
		initialValue: false,
	});
	if (isCancel(replaceDirectory)) {
		cancel('Nothing was copied.');
		return 'skip';
	}
	return replaceDirectory ? 'full' : 'replace-files';
}

/**
 * Text shown before the copy so the destination is visible.
 *
 * @remarks
 * Lists the vault-relative paths that will be written. A full replace, chosen
 * in a later prompt, deletes `destination` before the copy.
 */
export function obsidianCopyMessage(destination: string): string {
	const writes = [...KNOWLEDGE_DIRS.map((dir) => `${dir}/`), ...KNOWLEDGE_FILES];
	return [
		`Destination: ${destination}`,
		'',
		'Writes:',
		...writes.map((entry) => `  ${entry}`),
		'',
		'A file that already exists is replaced. Other files in this directory are left in place.',
	].join('\n');
}

/**
 * Copies wiki knowledge files into `destDir`.
 *
 * @remarks
 * `replaceDirectory` deletes `destDir` first. That path is already rejected when
 * it is `.` or `..`, because those resolve to the vault or its parent.
 */
export async function mirrorKnowledgeLayers(
	repoRoot: string,
	destDir: string,
	options: { replaceDirectory?: boolean } = {},
): Promise<void> {
	const destination = assertDirectoryTarget(destDir);
	if (options.replaceDirectory) {
		await rm(destination, { recursive: true, force: true });
	}
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
