import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import {
	FIXTURE_EXISTING_CSS_FILE_IN_DIST,
	FIXTURE_EXISTING_SVG_FILE_IN_DIST_PATH,
} from '../../../../__fixtures__/constants.js';
import { createFixtureAppConfig } from '../../../../__fixtures__/app/test-app-config.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import { STATUS_MESSAGE } from '../../../config/constants.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

let appConfig: Awaited<ReturnType<ConfigBuilder['build']>>;
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

	describe('isHtml', () => {
		it('should return true for text/html content type', () => {
			const result = responseFactory.isHtml('text/html');
			expect(result).toBe(true);
		});

		it('should return false for text/plain content type', () => {
			const result = responseFactory.isHtml('text/plain');
			expect(result).toBe(false);
		});

		it('should return false for other content types', () => {
			const result = responseFactory.isHtml('application/json');
			expect(result).toBe(false);
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

	describe('createDefaultNotFoundResponse', () => {
		it('should create a response with status 404 and body "file not found"', async () => {
			const response = await responseFactory.createDefaultNotFoundResponse();
			expect(response.status).toBe(404);
			expect(await response.text()).toBe(STATUS_MESSAGE[404]);
		});
	});

	describe('createHtmlNotFoundResponse', () => {
		it('should create an html 404 response from a rendered body', async () => {
			const response = await responseFactory.createHtmlNotFoundResponse('<h1>404 - Page Not Found</h1>');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
			expect(response.headers.get('Content-Type')).toBe('text/html');
			expect(response.status).toBe(404);
		});
	});

	describe('createDefaultServerErrorResponse', () => {
		it('should create a response with status 500 and the default server error body', async () => {
			const response = await responseFactory.createDefaultServerErrorResponse();
			expect(response.status).toBe(500);
			expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
			expect(await response.text()).toBe(STATUS_MESSAGE[500]);
		});
	});

	describe('createHtmlServerErrorResponse', () => {
		it('should create an html 500 response from a rendered body', async () => {
			const response = await responseFactory.createHtmlServerErrorResponse(
				'<h1>500 - Internal Server Error</h1>',
			);
			const body = await response.text();
			expect(body).toContain('<h1>500 - Internal Server Error</h1>');
			expect(response.headers.get('Content-Type')).toBe('text/html');
			expect(response.status).toBe(500);
			expect(response.statusText).toBe(STATUS_MESSAGE[500]);
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
			const response = await responseFactory.createFileResponse(cssFilePath, 'text/css');
			existsSpy.mockRestore();
			readFileAsBufferSpy.mockRestore();

			if (!response) {
				throw new Error('Expected gzip file response');
			}
			expect(response.headers.get('Content-Type')).toBe('text/css');
			expect(response.headers.get('Content-Encoding')).toBe('gzip');
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
	});
});
