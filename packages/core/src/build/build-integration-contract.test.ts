import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const integrationsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../integrations');

function collectIntegrationSourceFiles(directory: string): string[] {
	const entries = readdirSync(directory, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === 'dist') {
				continue;
			}
			files.push(...collectIntegrationSourceFiles(fullPath));
			continue;
		}

		if (
			/\.(?:ts|tsx)$/u.test(entry.name) &&
			!entry.name.endsWith('.test.ts') &&
			!entry.name.endsWith('.test.tsx')
		) {
			files.push(fullPath);
		}
	}

	return files;
}

describe('integration build contract', () => {
	it('does not call core build() directly from integration packages', () => {
		const offenders: string[] = [];

		for (const filePath of collectIntegrationSourceFiles(integrationsRoot)) {
			const source = readFileSync(filePath, 'utf8');
			if (/\bbuild\s*\(/u.test(source) && source.includes('@ecopages/core/build/build-adapter')) {
				offenders.push(path.relative(integrationsRoot, filePath));
			}
		}

		expect(offenders).toEqual([]);
	});
});
