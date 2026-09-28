import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	getDevToolbarPackageSpec,
	resolveDevToolbarClient,
	resolveDevToolbarPackageEntry,
} from './dev-toolbar-package.ts';

const referenceDevToolbarPackage = '@ecopages/dev-toolbar';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const devToolbarRoot = path.join(repoRoot, 'packages', 'dev-toolbar');

describe('dev-toolbar package resolution', () => {
	it('returns undefined when no package is configured', () => {
		expect(getDevToolbarPackageSpec({})).toBeUndefined();
		expect(getDevToolbarPackageSpec({ devToolbar: {} })).toBeUndefined();
	});

	it('returns the configured package specifier', () => {
		expect(
			getDevToolbarPackageSpec({
				devToolbar: { package: '@acme/dev-toolbar' },
			}),
		).toBe('@acme/dev-toolbar');
	});

	it('resolves the configured client from an app config project dir', () => {
		const entry = resolveDevToolbarPackageEntry(
			path.join(repoRoot, 'playground', 'kitchen-sink'),
			referenceDevToolbarPackage,
		);
		expect(entry).toContain(`${path.sep}packages${path.sep}dev-toolbar${path.sep}`);
	});

	it('resolves the reference toolbar package from the monorepo root', () => {
		const entry = resolveDevToolbarPackageEntry(repoRoot, referenceDevToolbarPackage);
		expect(entry).toContain(`${path.sep}packages${path.sep}dev-toolbar${path.sep}`);
	});

	it('prefers published bootstrap.js over TypeScript source when present', () => {
		const client = resolveDevToolbarClient(repoRoot, referenceDevToolbarPackage);
		const compiledEntry = path.join(devToolbarRoot, 'src', 'bootstrap.js');
		const sourceEntry = path.join(devToolbarRoot, 'src', 'bootstrap.ts');

		expect(client?.entryPath).toBe(existsSync(compiledEntry) ? compiledEntry : sourceEntry);
	});
});
