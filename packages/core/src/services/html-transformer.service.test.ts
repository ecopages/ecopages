import { describe, expect, it } from 'bun:test';
import type { ResolvedAsset } from './assets-dependency.service';
import { HtmlTransformerService } from './html-transformer.service';

describe('HtmlTransformerService', () => {
  const createMockResponse = (html: string) => {
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  };

  it('should inject script dependencies correctly', async () => {
    const dependencies: ResolvedAsset[] = [
      {
        provider: 'test',
        kind: 'script',
        inline: true,
        content: "console.log('test')",
        position: 'body',
        filePath: '/test.js',
        srcUrl: '/test.js',
        attributes: { id: 'test-script' },
      },
    ];

    const transformer = new HtmlTransformerService(dependencies);
    const mockResponse = createMockResponse('<html><head></head><body></body></html>');
    const result = await transformer.transform(mockResponse);
    const html = await result.text();

    expect(html).toContain('<script id="test-script">console.log(\'test\')</script>');
  });

  it('should inject stylesheet dependencies correctly', async () => {
    const dependencies: ResolvedAsset[] = [
      {
        provider: 'test',
        kind: 'stylesheet',
        inline: false,
        position: 'head',
        filePath: '/test.css',
        srcUrl: '/test.css',
        attributes: { media: 'screen' },
      },
    ];

    const transformer = new HtmlTransformerService(dependencies);
    const mockResponse = createMockResponse('<html><head></head><body></body></html>');
    const result = await transformer.transform(mockResponse);
    const html = await result.text();

    expect(html).toContain('<link rel="stylesheet" href="/test.css" media="screen">');
  });

  it('should handle both inline and src dependencies', async () => {
    const dependencies: ResolvedAsset[] = [
      {
        provider: 'test',
        kind: 'script',
        inline: true,
        content: 'const x = 1;',
        position: 'head',
        filePath: '/inline.js',
        srcUrl: '/inline.js',
      },
      {
        provider: 'test',
        kind: 'script',
        inline: false,
        position: 'body',
        filePath: '/external.js',
        srcUrl: '/external.js',
      },
    ];

    const transformer = new HtmlTransformerService(dependencies);
    const mockResponse = createMockResponse('<html><head></head><body></body></html>');
    const result = await transformer.transform(mockResponse);
    const html = await result.text();

    expect(html).toContain('<script>const x = 1;</script>');
    expect(html).toContain('<script src="/external.js"></script>');
  });

  it('should preserve existing HTML content', async () => {
    const dependencies: ResolvedAsset[] = [
      {
        provider: 'test',
        kind: 'script',
        inline: true,
        content: "console.log('test')",
        position: 'body',
        filePath: '/test.js',
        srcUrl: '/test.js',
      },
    ];

    const originalHtml = '<html><head><title>Test</title></head><body><div>Content</div></body></html>';
    const transformer = new HtmlTransformerService(dependencies);
    const mockResponse = createMockResponse(originalHtml);
    const result = await transformer.transform(mockResponse);
    const html = await result.text();

    expect(html).toContain('<title>Test</title>');
    expect(html).toContain('<div>Content</div>');
    expect(html).toContain("console.log('test')");
  });
});
