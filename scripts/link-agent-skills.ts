import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Agent skill directories linked by `pnpm init:dev`. `.agents/skills` stays the only committed copy.
 */
const DEFAULT_SKILL_TARGETS = ['.claude/skills', '.cursor/skills'];

const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const PROJECT_SCOPE = /^[ \t]+scope:[ \t]*project[ \t]*$/m;

export type LinkSkillsResult = {
	linked: string[];
	skipped: string[];
	pruned: string[];
};

/**
 * Links each skill folder in `sourceDir` (one that has a `SKILL.md`) to `<targetDir>/<name>`.
 *
 * @remarks
 * - Anything already at `<targetDir>/<name>` that is not a link to this skill is skipped, never
 *   replaced, so a personal skill with the same name survives.
 * - Links into `sourceDir` whose skill was removed are pruned.
 * - Links inside `repoRoot` are relative, so a moved checkout keeps working. Links outside it are
 *   absolute, and project skills (`metadata.scope: project`) are left out there because they only
 *   apply to this repository.
 */
export function linkSkills(sourceDir: string, targetDir: string, repoRoot: string): LinkSkillsResult {
	const result: LinkSkillsResult = { linked: [], skipped: [], pruned: [] };
	const insideRepo = !path.relative(repoRoot, targetDir).startsWith('..');
	const skills = readdirSync(sourceDir, { withFileTypes: true })
		.filter((entry) => {
			const manifest = path.join(sourceDir, entry.name, 'SKILL.md');
			return (
				entry.isDirectory() &&
				existsSync(manifest) &&
				(insideRepo || !PROJECT_SCOPE.test(FRONTMATTER.exec(readFileSync(manifest, 'utf8'))?.[1] ?? ''))
			);
		})
		.map((entry) => entry.name)
		.sort();

	mkdirSync(targetDir, { recursive: true });

	for (const name of skills) {
		const skillDir = path.join(sourceDir, name);
		const linkPath = path.join(targetDir, name);
		const existing = lstatSync(linkPath, { throwIfNoEntry: false });

		if (!existing) {
			symlinkSync(insideRepo ? path.relative(targetDir, skillDir) : skillDir, linkPath, 'dir');
			result.linked.push(linkPath);
		} else if (existing.isSymbolicLink() && path.resolve(targetDir, readlinkSync(linkPath)) === skillDir) {
			result.linked.push(linkPath);
		} else {
			result.skipped.push(linkPath);
		}
	}

	for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
		const linkPath = path.join(targetDir, entry.name);
		if (!entry.isSymbolicLink()) continue;
		const target = path.resolve(targetDir, readlinkSync(linkPath));
		if (path.dirname(target) === sourceDir && !existsSync(target)) {
			rmSync(linkPath);
			result.pruned.push(linkPath);
		}
	}

	return result;
}

function resolveTarget(target: string, repoRoot: string): string {
	const expanded = target === '~' || target.startsWith('~/') ? path.join(os.homedir(), target.slice(1)) : target;
	return path.resolve(repoRoot, expanded);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
	const repoRoot = path.resolve(import.meta.dirname, '..');
	const sourceDir = path.join(repoRoot, '.agents/skills');
	const targets = [...DEFAULT_SKILL_TARGETS, ...process.argv.slice(2).filter((arg) => arg !== '--')];

	for (const target of targets) {
		const { linked, skipped, pruned } = linkSkills(sourceDir, resolveTarget(target, repoRoot), repoRoot);
		for (const linkPath of skipped) console.warn(`[skip] ${linkPath} exists and is not a link to .agents/skills`);
		for (const linkPath of pruned) console.log(`[prune] ${linkPath}`);
		console.log(`[link] ${target}: ${linked.length} skills`);
	}
}
