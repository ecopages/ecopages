import { beforeAll, describe, expect, it } from 'bun:test';
import {
  FIXTURE_APP_BASE_URL,
  FIXTURE_APP_PROJECT_DIR,
  FIXTURE_EXISTING_SVG_FILE_IN_DIST_PATH,
} from '../../../fixtures/constants.ts';
import { STATUS_MESSAGE } from '../../constants.ts';
import { ConfigBuilder } from '../../main/config-builder.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

const appConfig = await new ConfigBuilder()
  .setRootDir(FIXTURE_APP_PROJECT_DIR)
  .setBaseUrl(FIXTURE_APP_BASE_URL)
  .build();

let responseFactory: FileSystemServerResponseFactory;

describe('FileSystemServerResponseFactory', () => {
  beforeAll(async () => {
    responseFactory = new FileSystemServerResponseFactory({
      appConfig,
      routeRendererFactory: new RouteRendererFactory({
        appConfig,
      }),
      options: {
        watchMode: false,
      },
    });
  });

  describe('isHtmlOrPlainText', () => {
    it('should return true for text/html content type', () => {
      const result = responseFactory.isHtmlOrPlainText('text/html');
      expect(result).toBe(true);
    });

    it('should return true for text/plain content type', () => {
      const result = responseFactory.isHtmlOrPlainText('text/plain');
      expect(result).toBe(true);
    });

    it('should return false for other content types', () => {
      const result = responseFactory.isHtmlOrPlainText('application/json');
      expect(result).toBe(false);
    });
  });

  describe('shouldEnableGzip', () => {
    it('should return false in watch mode', () => {
      const responseFactoryWatch = new FileSystemServerResponseFactory({
        appConfig,
        routeRendererFactory: new RouteRendererFactory({
          appConfig,
        }),
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

  describe('createResponseWithBody', async () => {
    it('should create a response with the given route renderer body', async () => {
      const routeRendererBody = '<html><body>Test</body></html>';
      const response = responseFactory.createResponseWithBody(routeRendererBody);
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

  describe('createCustomNotFoundResponse', () => {
    it('should create a response with status 404 if error404 template file does not exist', async () => {
      const customAppConfig = {
        ...appConfig,
        error404Template: 'non-existent-file',
        absolutePaths: {
          ...appConfig.absolutePaths,
          error404TemplatePath: 'non-existent-file',
        },
      };

      const responseFactoryNo404Template = new FileSystemServerResponseFactory({
        appConfig: customAppConfig,
        routeRendererFactory: new RouteRendererFactory({
          appConfig: customAppConfig,
        }),
        options: {
          watchMode: false,
        },
      });

      const response = await responseFactoryNo404Template.createCustomNotFoundResponse();
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(STATUS_MESSAGE[404]);
    });

    it('should create a response with the route renderer body if error404 template file exists', async () => {
      const response = await responseFactory.createCustomNotFoundResponse();
      const body = await response.text();
      expect(body).toInclude('<h1>404 - Page Not Found</h1>');
      expect(response.headers.get('Content-Type')).toBe('text/html');
    });
  });

  describe('createFileResponse', () => {
    it('should create a response with the file content and content type', async () => {
      const response = await responseFactory.createFileResponse(
        FIXTURE_EXISTING_SVG_FILE_IN_DIST_PATH,
        'image/svg+xml',
      );
      expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    });

    it('should create a response with status 404 if the file does not exist', async () => {
      const response = await responseFactory.createFileResponse('/path/to/nonexistent.txt', 'text/plain');
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(STATUS_MESSAGE[404]);
    });
  });
});
