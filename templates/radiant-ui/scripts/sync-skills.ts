/**
 * Downloads the Radiant and Radiant UI agent skill packs into `.agents/skills/`.
 *
 * Both sites publish a `skill.txt` index that links the entry `SKILL.md` and its
 * reference modules, so this script fetches that index, follows every `/skill/…`
 * link it names, and mirrors the tree locally. The result is committed, so a
 * fresh project has working skills offline; re-run this to pick up upstream
 * changes, or `--check` in CI to notice when the copy has drifted.
 *
 * Usage:
 *   pnpm run skills:sync                    # refresh every configured pack
 *   pnpm run skills:sync -- radiant-ui      # refresh one pack
 *   pnpm run skills:sync -- --check         # report drift without writing
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKILLS_DIR = path.join(ROOT, '.agents', 'skills');

type SkillPack = {
	/** Directory name under `.agents/skills/`. */
	id: string;
	/** Origin serving `/skill.txt` and the `/skill/**` tree. */
	origin: string;
};

const PACKS: SkillPack[] = [
	{ id: 'radiant', origin: 'https://radiant.ecopages.app' },
	{ id: 'radiant-ui', origin: 'https://radiant-ui.ecopages.app' },
];

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const requested = args.filter((arg) => !arg.startsWith('--'));

async function fetchText(url: string): Promise<string> {
	const response = await fetch(url, { headers: { accept: 'text/plain, text/markdown, */*' } });

	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText} — ${url}`);
	}

	return response.text();
}

/**
 * Pulls the `/skill/**` paths out of a `skill.txt` index. The index is written
 * as prose with markdown links, so the link targets are the contract rather
 * than any particular table layout.
 */
function extractSkillPaths(index: string): string[] {
	const paths = new Set<string>(['/skill/SKILL.md']);

	for (const match of index.matchAll(/\]\((\/skill\/[^)\s]+\.md)\)/g)) {
		paths.add(match[1]);
	}

	return [...paths].sort();
}

async function syncPack(pack: SkillPack): Promise<{ changed: string[]; total: number }> {
	const index = await fetchText(`${pack.origin}/skill.txt`);
	const paths = extractSkillPaths(index);
	const targetDir = path.join(SKILLS_DIR, pack.id);
	const changed: string[] = [];

	const files: Array<{ relative: string; content: string }> = [{ relative: 'skill.txt', content: index }];

	for (const remotePath of paths) {
		files.push({
			relative: remotePath.replace(/^\/skill\//, ''),
			content: await fetchText(`${pack.origin}${remotePath}`),
		});
	}

	for (const file of files) {
		const destination = path.join(targetDir, file.relative);
		const current = existsSync(destination) ? readFileSync(destination, 'utf8') : null;

		if (current === file.content) {
			continue;
		}

		changed.push(path.relative(ROOT, destination));

		if (!checkOnly) {
			mkdirSync(path.dirname(destination), { recursive: true });
			writeFileSync(destination, file.content);
		}
	}

	return { changed, total: files.length };
}

async function main(): Promise<void> {
	const packs = requested.length > 0 ? PACKS.filter((pack) => requested.includes(pack.id)) : PACKS;

	if (packs.length === 0) {
		console.error(`No such skill pack. Available: ${PACKS.map((pack) => pack.id).join(', ')}`);
		process.exitCode = 1;
		return;
	}

	let drift = 0;

	for (const pack of packs) {
		try {
			const { changed, total } = await syncPack(pack);
			drift += changed.length;

			if (changed.length === 0) {
				console.log(`${pack.id}: up to date (${total} files).`);
				continue;
			}

			console.log(`${pack.id}: ${changed.length}/${total} file(s) ${checkOnly ? 'out of date' : 'updated'}`);
			for (const file of changed) {
				console.log(`  ${file}`);
			}
		} catch (error) {
			console.error(`${pack.id}: ${error instanceof Error ? error.message : String(error)}`);
			process.exitCode = 1;
		}
	}

	if (checkOnly && drift > 0) {
		process.exitCode = 1;
	}
}

await main();
