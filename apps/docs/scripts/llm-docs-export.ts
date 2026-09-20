import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ContentScanner } from '@ecopages/content-processor';
import { DOCS_SECTION_CONFIG, LLM_SECTION_ORDER, type DocsFrontmatter } from '../src/content/docs';
import { absoluteUrl } from '../src/lib/docs/site-meta';
import { SKILL_REFERENCE_MODULES } from './skill-reference-modules';

type DocsManifestEntry = Awaited<ReturnType<ContentScanner<DocsFrontmatter>['getManifest']>>[number];

export function groupPostsBySection(posts: DocsManifestEntry[]): Map<string, DocsManifestEntry[]> {
	const sections = new Map<string, DocsManifestEntry[]>();

	for (const post of posts) {
		const sectionId = post.segments[0] ?? 'other';
		const sectionPosts = sections.get(sectionId);
		if (sectionPosts) {
			sectionPosts.push(post);
		} else {
			sections.set(sectionId, [post]);
		}
	}

	return sections;
}

export function orderedSectionIds(sections: Map<string, DocsManifestEntry[]>): string[] {
	return [
		...LLM_SECTION_ORDER.filter((section) => sections.has(section)),
		...Array.from(sections.keys())
			.filter((section) => !LLM_SECTION_ORDER.includes(section as (typeof LLM_SECTION_ORDER)[number]))
			.sort((left, right) => left.localeCompare(right)),
	];
}

export function appendAgentSkillSection(lines: string[], origin: string): void {
	lines.push('## Agent Skill');
	lines.push('');
	lines.push(`- [Skill index](${absoluteUrl('/skill.txt', origin)})`);
	lines.push(`- [SKILL.md](${absoluteUrl('/skill/SKILL.md', origin)})`);

	for (const module of SKILL_REFERENCE_MODULES) {
		if (module.path === 'SKILL.md') {
			continue;
		}

		lines.push(`- [${module.title}](${absoluteUrl(`/skill/${module.path}`, origin)})`);
	}

	lines.push('');
}

export async function exportLlmSectionPages(
	scanner: ContentScanner<DocsFrontmatter>,
	sectionId: string,
	sectionPosts: DocsManifestEntry[],
	stagingRoot: string,
	origin: string,
	lines: string[],
): Promise<void> {
	const sectionTitle = DOCS_SECTION_CONFIG[sectionId as keyof typeof DOCS_SECTION_CONFIG]?.title ?? sectionId;
	lines.push(`## ${sectionTitle}`);

	for (const page of sectionPosts) {
		if (page.llms === false) {
			continue;
		}

		const pageSlug = page.segments[page.segments.length - 1]!;
		const body = await scanner.getRawContent(page.slug);
		const outputPath = join(stagingRoot, sectionId, `${pageSlug}.md`);
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, body, 'utf8');

		const url = absoluteUrl(`/docs-llm/${sectionId}/${pageSlug}.md`, origin);
		lines.push(`- [${page.title}](${url})`);
	}

	lines.push('');
}
