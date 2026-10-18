import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Skill pack copied into official templates under `.agents/skills/<id>/`.
 */
export type TemplateSkillPackId = 'ecopages' | 'radiant' | 'radiant-ui';

type SkillPackSource = {
	id: TemplateSkillPackId;
	origin: string;
	sourceDir: (repoRoot: string) => string;
};

const SKILL_PACKS: Record<TemplateSkillPackId, SkillPackSource> = {
	ecopages: {
		id: 'ecopages',
		origin: 'https://ecopages.app',
		sourceDir: (repoRoot) => path.join(repoRoot, 'apps/docs/src/public/skill'),
	},
	radiant: {
		id: 'radiant',
		origin: 'https://radiant.ecopages.app',
		sourceDir: (repoRoot) => path.join(repoRoot, 'scripts/agent-skills/radiant'),
	},
	'radiant-ui': {
		id: 'radiant-ui',
		origin: 'https://radiant-ui.ecopages.app',
		sourceDir: (repoRoot) => path.join(repoRoot, 'scripts/agent-skills/radiant-ui'),
	},
};

/**
 * Packs shipped with each official template.
 *
 * @remarks
 * Radiant host and Radiant UI packs follow the template's actual dependencies,
 * not the display name. The JSX starter enables Radiant hosts but not Radiant UI.
 */
export const TEMPLATE_SKILL_PACKS: Record<string, TemplateSkillPackId[]> = {
	jsx: ['ecopages', 'radiant'],
	html: ['ecopages'],
	radiant: ['ecopages', 'radiant', 'radiant-ui'],
	'docs-starter': ['ecopages', 'radiant', 'radiant-ui'],
	'blog-jsx': ['ecopages', 'radiant', 'radiant-ui'],
	'llm-wiki': ['ecopages', 'radiant', 'radiant-ui'],
	react: ['ecopages'],
	'react-shadcn': ['ecopages'],
	'react-better-auth': ['ecopages'],
	'blog-react': ['ecopages'],
	'lit-jsx': ['ecopages'],
};

/**
 * Rewrites site-root markdown links so a copied skill pack still points at the hosted docs.
 */
export function rewriteHostedMarkdownLinks(markdown: string, origin: string): string {
	return markdown
		.replaceAll('[/llms.txt](/llms.txt)', `[llms.txt](${origin}/llms.txt)`)
		.replaceAll('[/skill.txt](/skill.txt)', `[skill.txt](${origin}/skill.txt)`)
		.replaceAll('[/skill/SKILL.md](/skill/SKILL.md)', `[SKILL.md](${origin}/skill/SKILL.md)`)
		.replaceAll('](/llms.txt)', `](${origin}/llms.txt)`)
		.replaceAll('](/skill.txt)', `](${origin}/skill.txt)`)
		.replaceAll('](/skill/SKILL.md)', `](${origin}/skill/SKILL.md)`);
}

function listMarkdownFiles(root: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...listMarkdownFiles(entryPath));
		} else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
			files.push(entryPath);
		}
	}
	return files.sort();
}

function agentsRoot(templateRoot: string): string {
	return path.join(templateRoot, '.agents');
}

function agentsSkillsRoot(templateRoot: string): string {
	return path.join(agentsRoot(templateRoot), 'skills');
}

const PACK_README_ROWS: Record<TemplateSkillPackId, { title: string; when: string }> = {
	ecopages: {
		title: 'Building with Ecopages',
		when: 'Pages, Layouts, Components, Integrations, Processors, eco.config.ts',
	},
	radiant: { title: 'Radiant reactive hosts', when: 'RadiantElement, RadiantController, @prop, bindings, SSR' },
	'radiant-ui': { title: 'Radiant UI', when: 'Rui* components, themes, semantic tokens' },
};

function writeAgentsIndex(templateRoot: string, packs: TemplateSkillPackId[]): void {
	const rows = packs
		.map((packId) => {
			const pack = SKILL_PACKS[packId];
			const meta = PACK_README_ROWS[packId];
			return `| ${meta.title} | [\`skills/${packId}/SKILL.md\`](./skills/${packId}/SKILL.md) | ${meta.when} | [${pack.origin}/skill/SKILL.md](${pack.origin}/skill/SKILL.md) |`;
		})
		.join('\n');

	writeFileSync(
		path.join(agentsRoot(templateRoot), 'README.md'),
		`# Agent skills

Skill packs for coding agents. Start at a pack's \`SKILL.md\`, then one file in \`reference/\`.

| Pack | Local entry | Read when | Hosted copy |
| --- | --- | --- | --- |
${rows}
`,
	);
}

/**
 * Copies canonical skill packs into a template `.agents/skills` directory.
 */
export function syncTemplateAgentSkills(repoRoot: string, templateId: string, templateRoot: string): void {
	const packs = TEMPLATE_SKILL_PACKS[templateId];
	if (!packs) {
		throw new Error(`No skill pack mapping for template ${templateId}.`);
	}

	const skillsRoot = agentsSkillsRoot(templateRoot);
	if (existsSync(skillsRoot)) {
		rmSync(skillsRoot, { recursive: true, force: true });
	}
	mkdirSync(skillsRoot, { recursive: true });

	for (const packId of packs) {
		const pack = SKILL_PACKS[packId];
		const sourceDir = pack.sourceDir(repoRoot);
		const targetDir = path.join(skillsRoot, packId);
		if (!existsSync(sourceDir)) {
			throw new Error(`Missing skill pack source: ${sourceDir}`);
		}
		cpSync(sourceDir, targetDir, { recursive: true });
		for (const filePath of listMarkdownFiles(targetDir)) {
			const original = readFileSync(filePath, 'utf8');
			const rewritten = rewriteHostedMarkdownLinks(original, pack.origin);
			if (rewritten !== original) {
				writeFileSync(filePath, rewritten);
			}
		}
	}

	writeAgentsIndex(templateRoot, packs);
}

/**
 * Asserts each official template's `.agents/skills` tree matches the canonical packs.
 */
export function assertTemplateAgentSkills(repoRoot: string, templatesRoot: string, templateIds: string[]): void {
	const mappedIds = Object.keys(TEMPLATE_SKILL_PACKS).sort();
	const expectedIds = [...templateIds].sort();
	if (JSON.stringify(mappedIds) !== JSON.stringify(expectedIds)) {
		throw new Error(
			`TEMPLATE_SKILL_PACKS keys must match official template IDs. Mapping: ${mappedIds.join(', ')}; templates: ${expectedIds.join(', ')}.`,
		);
	}

	for (const templateId of templateIds) {
		const packs = TEMPLATE_SKILL_PACKS[templateId];
		if (!packs) {
			throw new Error(`No skill pack mapping for template ${templateId}.`);
		}
		const templateRoot = path.join(templatesRoot, templateId);
		const skillsRoot = agentsSkillsRoot(templateRoot);
		if (!existsSync(path.join(agentsRoot(templateRoot), 'README.md'))) {
			throw new Error(`${templateId}: missing .agents/README.md.`);
		}
		const installedPacks = existsSync(skillsRoot)
			? readdirSync(skillsRoot, { withFileTypes: true })
					.filter((entry) => entry.isDirectory())
					.map((entry) => entry.name)
					.sort()
			: [];
		const expectedPacks = [...packs].sort();
		if (JSON.stringify(installedPacks) !== JSON.stringify(expectedPacks)) {
			throw new Error(
				`${templateId}: .agents/skills packs [${installedPacks.join(', ')}] do not match [${expectedPacks.join(', ')}].`,
			);
		}
		for (const packId of packs) {
			const pack = SKILL_PACKS[packId];
			const sourceDir = pack.sourceDir(repoRoot);
			const targetDir = path.join(skillsRoot, packId);
			const sourceFiles = listMarkdownFiles(sourceDir);
			const targetFiles = listMarkdownFiles(targetDir);
			const sourceRel = sourceFiles.map((filePath) => path.relative(sourceDir, filePath));
			const targetRel = targetFiles.map((filePath) => path.relative(targetDir, filePath));
			if (JSON.stringify(sourceRel) !== JSON.stringify(targetRel)) {
				throw new Error(
					`${templateId}: .agents/skills/${packId} files do not match ${path.relative(repoRoot, sourceDir)}.`,
				);
			}
			for (const relativePath of sourceRel) {
				const expected = rewriteHostedMarkdownLinks(
					readFileSync(path.join(sourceDir, relativePath), 'utf8'),
					pack.origin,
				);
				const actual = readFileSync(path.join(targetDir, relativePath), 'utf8');
				if (actual !== expected) {
					throw new Error(`${templateId}: stale ${path.join('.agents/skills', packId, relativePath)}.`);
				}
			}
		}
	}
}

function readOfficialTemplateIds(repoRoot: string): string[] {
	const manifestPath = path.join(repoRoot, 'packages/ecopages/templates.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { templates: Array<{ id: string }> };
	return manifest.templates.map((template) => template.id);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
	const repoRoot = path.resolve(import.meta.dirname, '..');
	const templatesRoot = path.join(repoRoot, 'templates');
	const checkOnly = process.argv.includes('--check');
	const templateIds = readOfficialTemplateIds(repoRoot);

	if (checkOnly) {
		assertTemplateAgentSkills(repoRoot, templatesRoot, templateIds);
		console.log(`Validated agent skills for ${templateIds.length} templates.`);
	} else {
		for (const templateId of templateIds) {
			syncTemplateAgentSkills(repoRoot, templateId, path.join(templatesRoot, templateId));
		}
		console.log(`Synced agent skills into ${templateIds.length} templates.`);
	}
}
