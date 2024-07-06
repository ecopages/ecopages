import { beforeAll, beforeEach, describe, expect, it, jest } from 'bun:test';
import { FIXTURE_APP_PROJECT_DIR, FIXTURE_EXISTING_SVG_FILE_IN_DIST_PATH } from '../../../fixtures/constants.ts';
import { AppConfigurator } from '../../main/app-configurator.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

let appConfigurator: AppConfigurator;

let responseFactory: FileSystemServerResponseFactory;

describe('FileSystemServerResponseFactory', () => {
  beforeAll(async () => {
    appConfigurator = await AppConfigurator.create({
      projectDir: FIXTURE_APP_PROJECT_DIR,
    });
    responseFactory = new FileSystemServerResponseFactory({
      appConfig: appConfigurator.config,
      routeRendererFactory: new RouteRendererFactory({
        appConfig: appConfigurator.config,
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
        appConfig: appConfigurator.config,
        routeRendererFactory: new RouteRendererFactory({
          appConfig: appConfigurator.config,
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

  describe('createNotFoundResponse', () => {
    it('should create a response with status 404 if error404 template file does not exist', async () => {
      const responseFactoryNo404Template = new FileSystemServerResponseFactory({
        appConfig: {
          ...appConfigurator.config,
          error404Template: 'non-existent-file',
          absolutePaths: {
            ...appConfigurator.config.absolutePaths,
            error404TemplatePath: 'non-existent-file',
          },
        },
        routeRendererFactory: new RouteRendererFactory({
          appConfig: appConfigurator.config,
        }),
        options: {
          watchMode: false,
        },
      });

      const response = await responseFactoryNo404Template.createNotFoundResponse();
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('file not found');
    });

    it('should create a response with the route renderer body if error404 template file exists', async () => {
      const response = await responseFactory.createNotFoundResponse();
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
      expect(await response.text()).toBe('file not found');
    });
  });
});
