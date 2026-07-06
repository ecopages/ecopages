import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { stripMdxCeremony } from './strip-mdx-ceremony';

const FIXTURE = `import { DocsLayout } from '@/lib/docs-kit/layout';
import { Banner } from '@/components/banner/banner';

export const config = {
  layout: DocsLayout,
};

export const getMetadata = () => ({
  title: 'Docs | Introduction',
  description: 'Discover Ecopages',
});

# Welcome

<Banner type="alert">Hello</Banner>
`;

describe('stripMdxCeremony', () => {
	test('removes imports, config, and getMetadata while preserving body JSX', () => {
		const result = stripMdxCeremony(FIXTURE);

		expect(result).not.toMatch(/^import /m);
		expect(result).not.toMatch(/export const config/);
		expect(result).not.toMatch(/export const getMetadata/);
		expect(result).toMatch(/# Welcome/);
		expect(result).toMatch(/<Banner type="alert">Hello<\/Banner>/);
	});

	test('matches introduction.mdx snapshot', () => {
		const source = readFileSync(
			join(import.meta.dirname, '../src/content/docs/getting-started/introduction.mdx'),
			'utf8',
		);
		const result = stripMdxCeremony(source);

		expect(result).toMatch(/^# Welcome to Ecopages/m);
		expect(result).toMatch(/<Banner type="alert">/);
		expect(result).toMatch(/<CodeTabs/);
		expect(result).not.toMatch(/import \{ DocsLayout \}/);
	});

	test('matches configuration.mdx with ApiField', () => {
		const source = readFileSync(
			join(import.meta.dirname, '../src/content/docs/getting-started/configuration.mdx'),
			'utf8',
		);
		const result = stripMdxCeremony(source);

		expect(result).toMatch(/^# Configuration/m);
		expect(result).not.toMatch(/import \{ ApiField \}/);
	});

	test('does not strip getMetadata inside code examples', () => {
		const source = `# Example

\`\`\`typescript
export const getMetadata = () => ({ title: 'Inside fence' });
\`\`\`
`;
		const result = stripMdxCeremony(source);

		expect(result).toMatch(/export const getMetadata = \(\) => \(\{ title: 'Inside fence' \}\)/);
	});
});
