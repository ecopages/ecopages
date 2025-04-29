import path from 'node:path';
import { appLogger } from '../../global/app-logger.ts';
import type { MatchResult } from '../../internal-types.ts';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import type { FSRouter } from '../../router/fs-router.ts';
import { ServerUtils } from '../../utils/server-utils.module.ts';
import type { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

export class FileSystemResponseMatcher {
  private router: FSRouter;
  private routeRendererFactory: RouteRendererFactory;
  private fileSystemResponseFactory: FileSystemServerResponseFactory;

  constructor({
    router,
    routeRendererFactory,
    fileSystemResponseFactory,
  }: {
    router: FSRouter;
    routeRendererFactory: RouteRendererFactory;
    fileSystemResponseFactory: FileSystemServerResponseFactory;
  }) {
    this.router = router;
    this.routeRendererFactory = routeRendererFactory;
    this.fileSystemResponseFactory = fileSystemResponseFactory;
  }

  async handleNoMatch(requestUrl: string): Promise<Response> {
    const filePath = path.join(this.router.assetPrefix, requestUrl);
    const contentType = ServerUtils.getContentType(filePath);

    if (this.fileSystemResponseFactory.isHtmlOrPlainText(contentType)) {
      return this.fileSystemResponseFactory.createCustomNotFoundResponse();
    }

    return this.fileSystemResponseFactory.createFileResponse(filePath, contentType);
  }

  async handleMatch(match: MatchResult): Promise<Response> {
    try {
      const routeRenderer = this.routeRendererFactory.createRenderer(match.filePath);

      const renderedBody = await routeRenderer.createRoute({
        file: match.filePath,
        params: match.params,
        query: match.query,
      });

      return await this.fileSystemResponseFactory.createResponseWithBody(renderedBody);
    } catch (error) {
      if (error instanceof Error) {
        if (appLogger.isDebugEnabled()) {
          appLogger.error(`[FileSystemResponseMatcher] ${error.message} at ${match.pathname}`);
        }
      }
      return this.fileSystemResponseFactory.createCustomNotFoundResponse();
    }
  }
}
