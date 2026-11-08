import { describe, expect, it } from 'vitest';
import { highlightCodeTab, inferTabLang } from './code-highlighter';

describe('inferTabLang', () => {
	it('prefers an explicit lang', () => {
		expect(inferTabLang({ label: 'x', code: 'npm i', lang: 'json' })).toBe('json');
	});

	it('uses the label extension, then shell for install commands, then tsx', () => {
		expect(inferTabLang({ label: 'eco.config.ts', code: 'const a = 1' })).toBe('typescript');
		expect(inferTabLang({ label: 'bun', code: 'bun add @ecopages/core' })).toBe('shellscript');
		expect(inferTabLang({ label: 'Lightning CSS', code: 'export default {}' })).toBe('tsx');
	});
});

describe('highlightCodeTab', () => {
	it('emits dual-theme Shiki markup, keeps every line and copies the exact source', () => {
		const code = 'export default {\n\tprocessors: [],\n};';
		const tab = highlightCodeTab({ id: 'a', label: 'A', code });

		expect(tab.content).toBe(code);
		expect(tab.html).toContain('--shiki-light:');
		expect(tab.html).toContain('--shiki-dark:');
		expect(tab.html.match(/class="line"/g)).toHaveLength(3);
		expect(tab.html).toContain('data-rehype-pretty-code-figure');
	});
});

describe('highlightCodeTab with a file', () => {
	it('reads the source from the repository file with its indentation intact', () => {
		const tab = highlightCodeTab({
			id: 'a',
			label: 'A',
			file: 'apps/docs/src/snippets/postcss-tailwind-v4.txt',
			lang: 'typescript',
		});

		expect(tab.content).toContain('\n\tprocessors: [\n\t\tpostcssProcessorPlugin(');
	});
});
