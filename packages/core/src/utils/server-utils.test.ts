import { describe, expect, test } from 'bun:test';
import { FIXTURE_APP_PROJECT_DIR } from '../../__fixtures__/constants.js';
import { ConfigBuilder } from '../config/config-builder.ts';
import { ServerUtils } from './server-utils.module.ts';

await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

describe('ServerUtils', () => {
	test.each([
		['/my-file.controller.js', 'text/javascript'],
		['/my-file.css', 'text/css'],
		['/my-file.html', 'text/html'],
		['/my-file.json', 'application/json'],
		['/my-file.png', 'image/png'],
		['/my-file.jpg', 'image/jpeg'],
		['/my-file.jpeg', 'image/jpeg'],
		['/my-file.svg', 'image/svg+xml'],
		['/my-file.gif', 'image/gif'],
		['/my-file.ico', 'image/x-icon'],
		['/my-file', 'text/plain'],
	])('getContentType(%p) should return %p', (filePath, expected) => {
		expect(ServerUtils.getContentType(filePath)).toBe(expected);
	});

	test.each([
		['/file.css', true],
		['/file.js', true],
		['/file.html', true],
		['/file.txt', true],
		['/file.png', true],
		['/page', false],
		['/page.', false],
		['/page.xyz', false],
		['/page.dd', false],
	])('hasKnownExtension(%p) should return %p', (filePath, expected) => {
		expect(ServerUtils.hasKnownExtension(filePath)).toBe(expected);
	});
});
