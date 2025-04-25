import { describe, expect, it } from 'bun:test';
import { EcopagesUrlResolver } from './ecopages-url-resolver';

const mockConfig = {
  srcDir: '/project/src',
  distDir: '/project/dist',
} as any;

describe('EcopagesUrlResolver', () => {
  describe('Path Transformations', () => {
    it('should handle basic path transformations', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver.from('/project/src/pages/index.tsx').toRelativeSrcPath().build();

      expect(result).toBe('/pages/index.tsx');
    });

    it('should handle multiple directory changes', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver
        .from('/project/src/pages/index.tsx')
        .toRelativeSrcPath()
        .setParentDir('assets')
        .setParentDir('public')
        .build();

      expect(result).toBe('public/assets/pages/index.tsx');
    });
  });

  describe('File Extension Handling', () => {
    it('should replace typescript extensions with js', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver.from('/pages/file.tsx').replaceExtensionInUrl('.js').build();

      expect(result).toBe('/pages/file.js');
    });

    it('should handle extension with or without dot', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      expect(resolver.from('/pages/file.tsx').replaceExtensionInUrl('js').build()).toBe('/pages/file.js');

      expect(resolver.from('/pages/file.tsx').replaceExtensionInUrl('.js').build()).toBe('/pages/file.js');
    });
  });

  describe('Filename Operations', () => {
    it('should replace filename while keeping extension', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver.from('/pages/old-name.tsx').replaceFilenameInUrl('new-name').build();

      expect(result).toBe('/pages/new-name.tsx');
    });

    it('should preserve directory structure when replacing filename', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver.from('/deep/nested/path/old-name.tsx').replaceFilenameInUrl('new-name').build();

      expect(result).toBe('/deep/nested/path/new-name.tsx');
    });
  });

  describe('Slash Handling', () => {
    it('should handle leading slash correctly', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver.from('pages/index.tsx').withLeadingSlash().build();

      expect(result).toBe('/pages/index.tsx');
    });

    it('should handle trailing slash correctly', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver.from('/pages/index').withTrailingSlash().build();

      expect(result).toBe('/pages/index/');
    });

    it('should not duplicate slashes', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver.from('/pages/index/').withLeadingSlash().withTrailingSlash().build();

      expect(result).toBe('/pages/index/');
    });
  });

  describe('Error Handling', () => {
    it('should throw when no path is set', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      expect(() => resolver.build()).toThrow('No path set');
    });

    it('should throw on invalid extension', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      expect(() => resolver.from('/pages/file.tsx').replaceExtensionInUrl('.invalid!').build()).toThrow(
        'Invalid extension format',
      );
    });
  });

  describe('Complex Chains', () => {
    it('should handle complex transformation chains', () => {
      const resolver = new EcopagesUrlResolver(mockConfig);
      const result = resolver
        .from('/project/src/pages/index.tsx')
        .toRelativeSrcPath()
        .setParentDir('assets')
        .replaceFilenameInUrl('main')
        .replaceExtensionInUrl('js')
        .withLeadingSlash()
        .build();

      expect(result).toBe('/assets/pages/main.js');
    });
  });
});
