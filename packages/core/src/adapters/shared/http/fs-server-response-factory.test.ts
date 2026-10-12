import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import {
	FIXTURE_EXISTING_CSS_FILE_IN_DIST,
	FIXTURE_EXISTING_SVG_FILE_IN_DIST_PATH,
} from '../../../../__fixtures__/constants.js';
import { createFixtureAppConfig } from '../../../../__fixtures__/app/test-app-config.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { STATUS_MESSAGE } from '../../../config/constants.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import { recordHashedBrowserAsset } from '../../../services/assets/hashed-browser-asset.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

let appConfig: EcoPagesAppConfig;
let responseFactory: FileSystemServerResponseFactory;

describe('FileSystemServerResponseFactory', () => {
	beforeAll(async () => {
		appConfig = await createFixtureAppConfig();

		for (const integration of appConfig.integrations) {
			integration.setConfig(appConfig);
			integration.setRuntimeOrigin(appConfig.baseUrl);
		}

		responseFactory = new FileSystemServerResponseFactory({
			options: {
				watchMode: false,
			},
		});
	});

	describe('shouldEnableGzip', () => {
		it('should return false in watch mode', () => {
			const responseFactoryWatch = new FileSystemServerResponseFactory({
				options: {
					watchMode: true,
				},
			});

			const result = responseFactoryWatch.shouldEnableGzip('text/javascript');
			expect(result).toBe(false);
		});

		it('should return true for text/javascript content type', () => {
			const result = responseFactory.shouldEnableGzip('text/javascript');
			expect(result).toBe(true);
		});

		it('should return true for text/css content type', () => {
			const result = responseFactory.shouldEnableGzip('text/css');
			expect(result).toBe(true);
		});

		it('should return false for other content types', () => {
			const result = responseFactory.shouldEnableGzip('application/json');
			expect(result).toBe(false);
		});
	});

	describe('createResponseWithBody', () => {
		it('should create a response with the given route renderer body', async () => {
			const routeRendererBody = '<html><body>Test</body></html>';
			const response = await responseFactory.createResponseWithBody(routeRendererBody);
			const body = await response.text();
			expect(body).toBe(routeRendererBody);
			expect(response.headers.get('Content-Type')).toBe('text/html');
		});
	});

	describe('createHtmlErrorResponse', () => {
		it('should create an html 404 response from a rendered body', async () => {
			const response = await responseFactory.createHtmlErrorResponse(404, '<h1>404 - Page Not Found</h1>');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(response.status).toBe(404);
			expect(response.statusText).toBe(STATUS_MESSAGE[404]);
		});

		it('should create an html 500 response from a rendered body', async () => {
			const response = await responseFactory.createHtmlErrorResponse(500, '<h1>500 - Internal Server Error</h1>');
			const body = await response.text();
			expect(body).toContain('<h1>500 - Internal Server Error</h1>');
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			expect(response.status).toBe(500);
			expect(response.statusText).toBe(STATUS_MESSAGE[500]);
		});

		it('should keep a non-factory status on the response envelope', async () => {
			const response = await responseFactory.createHtmlErrorResponse(502, '<h1>Bad Gateway</h1>');
			expect(response.status).toBe(502);
			expect(response.statusText).toBe('502');
		});
	});

	describe('createFileResponse', () => {
		it('should create a response with the file content and content type', async () => {
			const readFileAsBufferSpy = vi
				.spyOn(fileSystem, 'readFileAsBuffer')
				.mockReturnValue(Buffer.from('<svg></svg>'));

			const response = await responseFactory.createFileResponse(
				FIXTURE_EXISTING_SVG_FILE_IN_DIST_PATH,
				'image/svg+xml',
			);
			readFileAsBufferSpy.mockRestore();
			if (!response) {
				throw new Error('Expected static file response');
			}
			expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
		});

		it('should return null if the file does not exist', async () => {
			const response = await responseFactory.createFileResponse('/path/to/nonexistent.txt', 'text/plain');
			expect(response).toBeNull();
		});

		it('does not expose the internal hashed-output index', async () => {
			const response = await responseFactory.createFileResponse(
				'/dist/assets/.ecopages-hashed-assets',
				'application/octet-stream',
			);
			expect(response).toBeNull();
		});

		it('should log debug for ENOENT errors', async () => {
			const debugSpy = vi.spyOn(appLogger, 'debug');
			const errorSpy = vi.spyOn(appLogger, 'error');

			await responseFactory.createFileResponse('/path/to/nonexistent-debug.txt', 'text/plain');

			expect(debugSpy).toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();

			debugSpy.mockRestore();
			errorSpy.mockRestore();
		});

		it('should serve gzip file with Content-Encoding header when gzip is enabled', async () => {
			const cssFilePath = `${appConfig.absolutePaths.distDir}/${FIXTURE_EXISTING_CSS_FILE_IN_DIST}`;
			const existsSpy = vi
				.spyOn(fileSystem, 'exists')
				.mockImplementation((filePath) => filePath === `${cssFilePath}.gz`);
			const readFileAsBufferSpy = vi
				.spyOn(fileSystem, 'readFileAsBuffer')
				.mockReturnValue(Buffer.from('body{color:red}'));
			const response = await responseFactory.createFileResponse(cssFilePath, 'text/css', {
				acceptEncoding: 'gzip',
			});
			existsSpy.mockRestore();
			readFileAsBufferSpy.mockRestore();

			if (!response) {
				throw new Error('Expected gzip file response');
			}
			expect(response.headers.get('Content-Type')).toBe('text/css');
			expect(response.headers.get('Content-Encoding')).toBe('gzip');
		});

		it('respects an explicit gzip exclusion over the wildcard encoding', async () => {
			const cssFilePath = `${appConfig.absolutePaths.distDir}/${FIXTURE_EXISTING_CSS_FILE_IN_DIST}`;
			const existsSpy = vi
				.spyOn(fileSystem, 'exists')
				.mockImplementation((filePath) => filePath === `${cssFilePath}.gz`);
			const readFileAsBufferSpy = vi
				.spyOn(fileSystem, 'readFileAsBuffer')
				.mockReturnValue(Buffer.from('body{color:red}'));
			const response = await responseFactory.createFileResponse(cssFilePath, 'text/css', {
				acceptEncoding: 'gzip;q=0, *;q=1',
			});
			existsSpy.mockRestore();
			readFileAsBufferSpy.mockRestore();

			if (!response) {
				throw new Error('Expected CSS file response');
			}
			expect(response.headers.get('Content-Encoding')).toBeNull();
		});

		it('should not set Content-Encoding header for non-gzip content types', async () => {
			const readFileAsBufferSpy = vi
				.spyOn(fileSystem, 'readFileAsBuffer')
				.mockReturnValue(Buffer.from('<svg></svg>'));
			const response = await responseFactory.createFileResponse(
				FIXTURE_EXISTING_SVG_FILE_IN_DIST_PATH,
				'image/svg+xml',
			);
			readFileAsBufferSpy.mockRestore();

			if (!response) {
				throw new Error('Expected non-gzip file response');
			}
			expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
			expect(response.headers.get('Content-Encoding')).toBeNull();
		});

		it('sends immutable Cache-Control for a recorded Rolldown output with a dashed hash', async () => {
			const filepath = '/dist/assets/pages__docs__index-DlXqs-Dv.js';
			recordHashedBrowserAsset(filepath);
			const readFileAsBufferSpy = vi
				.spyOn(fileSystem, 'readFileAsBuffer')
				.mockReturnValue(Buffer.from('body{color:red}'));
			const response = await responseFactory.createFileResponse(filepath, 'text/javascript');
			readFileAsBufferSpy.mockRestore();

			if (!response) {
				throw new Error('Expected hashed asset response');
			}
			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('does not send immutable Cache-Control for an unrecorded public asset', async () => {
			const readFileAsBufferSpy = vi
				.spyOn(fileSystem, 'readFileAsBuffer')
				.mockReturnValue(Buffer.from('body{color:red}'));
			const response = await responseFactory.createFileResponse(
				'/dist/assets/site-navigation.js',
				'text/javascript',
			);
			readFileAsBufferSpy.mockRestore();

			if (!response) {
				throw new Error('Expected unhashed asset response');
			}
			expect(response.headers.get('Cache-Control')).toBeNull();
		});

		it('revalidates exported HTML and never marks it immutable', async () => {
			const filepath = '/dist/privacy-statement.html';
			const readFileAsBufferSpy = vi
				.spyOn(fileSystem, 'readFileAsBuffer')
				.mockReturnValue(Buffer.from('<html>privacy</html>'));
			const response = await responseFactory.createFileResponse(filepath, 'text/html');

			if (!response) throw new Error('Expected exported HTML response');
			const etag = response.headers.get('ETag');
			expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
			expect(response.headers.get('Cache-Control')).not.toContain('immutable');
			expect(etag).toMatch(/^"[a-f0-9]{16}"$/);

			const notModified = await responseFactory.createFileResponse(filepath, 'text/html', { ifNoneMatch: etag });
			expect(notModified?.status).toBe(304);
			readFileAsBufferSpy.mockRestore();
		});

		it('revalidates stable file URLs in watch mode', async () => {
			const watchFactory = new FileSystemServerResponseFactory({
				options: {
					watchMode: true,
				},
			});
			const readFileAsBufferSpy = vi
				.spyOn(fileSystem, 'readFileAsBuffer')
				.mockReturnValue(Buffer.from('body{color:red}'));
			const response = await watchFactory.createFileResponse('/dist/assets/abcdef0123456789.css', 'text/css');
			readFileAsBufferSpy.mockRestore();

			if (!response) {
				throw new Error('Expected watch-mode asset response');
			}
			expect(response.headers.get('Cache-Control')).toBe('no-cache');
		});
	});
});
