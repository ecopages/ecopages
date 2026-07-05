import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import { generateLlmDocs } from './generate-llm-docs';

test('generateLlmDocs writes markdown files and llms.txt to the output directory', async () => {
	const outputRoot = await mkdtemp(join(tmpdir(), 'docs-llm-public-'));

	try {
		await generateLlmDocs(outputRoot);

		const introduction = await readFile(join(outputRoot, 'docs-llm/getting-started/introduction.md'), 'utf8');
		const llmsTxt = await readFile(join(outputRoot, 'llms.txt'), 'utf8');

		expect(introduction).toMatch(/^# Welcome to Ecopages/);
		expect(llmsTxt).toContain('/docs-llm/getting-started/introduction.md');
		expect(llmsTxt).not.toContain('/docs-llm/getting-started/installation.md');
	} finally {
		await rm(outputRoot, { recursive: true, force: true });
	}
});
