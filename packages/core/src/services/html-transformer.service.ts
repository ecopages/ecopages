import { appLogger } from 'src/global/app-logger';
import type { AssetInjectionPosition, ResolvedAsset } from './assets-dependency.service';

export class HtmlTransformerService {
  constructor(private processedDependencies: ResolvedAsset[] = []) {}

  private formatAttributes(attrs?: Record<string, string>): string {
    if (!attrs) return '';
    return ` ${Object.entries(attrs)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')}`;
  }

  private generateScriptTag(dep: ResolvedAsset): string {
    return dep.inline
      ? `<script${this.formatAttributes(dep.attributes)}>${dep.content}</script>`
      : `<script src="${dep.srcUrl}"${this.formatAttributes(dep.attributes)}></script>`;
  }

  private generateStylesheetTag(dep: ResolvedAsset): string {
    return dep.inline
      ? `<style${this.formatAttributes(dep.attributes)}>${dep.content}</style>`
      : `<link rel="stylesheet" href="${dep.srcUrl}"${this.formatAttributes(dep.attributes)}>`;
  }

  private appendDependencies(element: HTMLRewriterTypes.Element, dependencies: ResolvedAsset[]) {
    for (const dep of dependencies) {
      const tag = dep.kind === 'script' ? this.generateScriptTag(dep) : this.generateStylesheetTag(dep);
      element.append(tag, { html: true });
    }
  }

  setProcessedDependencies(processedDependencies: ResolvedAsset[]) {
    appLogger.debug('Setting processed dependencies', { count: processedDependencies.length });
    this.processedDependencies = processedDependencies;
  }

  async transform(res: Response): Promise<Response> {
    const { head, body } = this.groupDependenciesByPosition();
    appLogger.debug('Transforming HTML with dependencies', { head: head.length, body: body.length });

    const html = await res.text();

    const rewriter = new HTMLRewriter()
      .on('head', {
        element: (element) => this.appendDependencies(element, head),
      })
      .on('body', {
        element: (element) => this.appendDependencies(element, body),
      });

    return rewriter.transform(
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
          const position = dep.position || 'body';
          acc[position].push(dep);
        } else if (dep.kind === 'stylesheet') {
          acc.head.push(dep);
        }
        return acc;
      },
      { head: [], body: [] } as Record<AssetInjectionPosition, ResolvedAsset[]>,
    );
  }
}
