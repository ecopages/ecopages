import { describe, expect, test } from 'bun:test';
import { PathUtils } from './path-utils';

describe('PathUtils', () => {
  test.each([
    ['packages/core/src/utils/file-name-analyzer.ts', undefined],
    ['packages/playground/src/pages/blog/author/%5Bid%5D.kita.tsx', 'kita'],
    ['packages/core/src/component-utils/deps-manager.ts', undefined],
    ['/packages/core/src/plugins/build-html-pages/build-html-pages.plugin.ts', 'plugin'],
    ['packages/core/src/eco-pages.fake.descriptor.ts', 'descriptor'],
  ])('getNameDescriptor: %p should return %p', (filePath, expected) => {
    const result = PathUtils.getNameDescriptor(filePath);
    if (expected === undefined) {
      expect(result).toBeUndefined();
    } else {
      expect(result).toBe(expected);
    }
  });
});
