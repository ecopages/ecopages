import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { toInstalledPackageExternalId } from './rolldown-adapter-helpers.ts';

describe('toInstalledPackageExternalId', () => {
	it('returns a relative path from the output directory on the same drive', () => {
		expect(
			toInstalledPackageExternalId(
				'D:/a/ecopages/node_modules/.pnpm/oxc-resolver@1/node_modules/oxc-resolver/index.js',
				'D:\\a\\ecopages\\app\\.eco',
				path.win32,
			),
		).toBe('../../node_modules/.pnpm/oxc-resolver@1/node_modules/oxc-resolver/index.js');
	});

	it('treats drive letter case as the same drive', () => {
		expect(
			toInstalledPackageExternalId('d:\\a\\app\\node_modules\\pkg\\index.js', 'D:\\a\\app\\dist', path.win32),
		).toBe('../node_modules/pkg/index.js');
	});

	it('returns a file URL when the package is on another drive than the output directory', () => {
		expect(
			toInstalledPackageExternalId(
				'D:/a/ecopages/node_modules/oxc-resolver/index.js',
				'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\out',
				path.win32,
			),
		).toBe('file:///D:/a/ecopages/node_modules/oxc-resolver/index.js');
	});

	it('returns a relative path for posix paths', () => {
		expect(toInstalledPackageExternalId('/app/node_modules/pkg/index.js', '/app/dist/server', path.posix)).toBe(
			'../../node_modules/pkg/index.js',
		);
		expect(toInstalledPackageExternalId('/app/dist/server/vendor/x.js', '/app/dist/server', path.posix)).toBe(
			'./vendor/x.js',
		);
	});
});
