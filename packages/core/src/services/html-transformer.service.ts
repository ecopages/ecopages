import { appLogger } from '../global/app-logger';
import type { AssetPosition, ProcessedAsset } from './assets-dependency-service/assets.types';

export class HtmlTransformerService {
  htmlRewriter: HTMLRewriter;
  constructor(private processedDependencies: ProcessedAsset[] = []) {
    this.htmlRewriter = new HTMLRewriter();
  }

  private formatAttributes(attrs?: Record<string, string>): string {
    if (!attrs) return '';
    return ` ${Object.entries(attrs)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')}`;
  }

  private generateScriptTag(dep: ProcessedAsset & { kind: 'script' }): string {
    return dep.inline
      ? `<script${this.formatAttributes(dep.attributes)}>${dep.content}</script>`
      : `<script src="${dep.srcUrl}"${this.formatAttributes(dep.attributes)}></script>`;
  }

  private generateStylesheetTag(dep: ProcessedAsset): string {
    return dep.inline
      ? `<style${this.formatAttributes(dep.attributes)}>${dep.content}</style>`
      : `<link rel="stylesheet" href="${dep.srcUrl}"${this.formatAttributes(dep.attributes)}>`;
  }

  private appendDependencies(element: HTMLRewriterTypes.Element, dependencies: ProcessedAsset[]) {
    for (const dep of dependencies) {
      const tag = dep.kind === 'script' ? this.generateScriptTag(dep) : this.generateStylesheetTag(dep);
      element.append(tag, { html: true });
    }
  }

  setProcessedDependencies(processedDependencies: ProcessedAsset[]) {
    appLogger.debug('Setting processed dependencies', { count: processedDependencies.length });
    this.processedDependencies = processedDependencies;
  }

  async transform(res: Response): Promise<Response> {
    const { head, body } = this.groupDependenciesByPosition();

    const html = await res.text();

    this.htmlRewriter
      .on('head', {
        element: (element) => this.appendDependencies(element, head),
      })
      .on('body', {
        element: (element) => this.appendDependencies(element, body),
      });

    return this.htmlRewriter.transform(
      new Response(html, {
        headers: res.headers,
        status: res.status,
        statusText: res.statusText,
      }),
    );
  }

  private groupDependenciesByPosition() {
    return this.processedDependencies.reduce(
      (acc, dep) => {
        if (dep.kind === 'script') {
          if (dep.excludeFromHtml) return acc;
          const position = dep.position || 'body';
          acc[position].push(dep);
        } else if (dep.kind === 'stylesheet') {
          acc.head.push(dep);
        }
        return acc;
      },
      { head: [], body: [] } as Record<AssetPosition, ProcessedAsset[]>,
    );
  }
}
