import { expect, test, mock, beforeEach } from 'bun:test';
import { AssetsDependencyService } from './assets-dependency.service';
import { FileUtils } from '../../utils/file-utils.module';

const mockConfig = {
  absolutePaths: {
    distDir: '/test/dist',
  },
} as any;

const mockProcessor = {
  process: async () => ({
    filepath: '/test/dist/assets/test.js',
    kind: 'script',
    inline: false,
  }),
};

beforeEach(() => {
  FileUtils.ensureDirectoryExists = mock(() => {});
  FileUtils.gzipDirSync = mock(() => {});
});

test('AssetsDependencyService - registerProcessor', () => {
  const service = new AssetsDependencyService(mockConfig);
  service.registerProcessor('script', 'file', mockProcessor);
  expect(service.getRegistry().getProcessor('script', 'file')).toBeDefined();
});

test('AssetsDependencyService - processDependencies', async () => {
  const service = AssetsDependencyService.createWithDefaultProcessors(mockConfig);
  const results = await service.processDependencies(
    [
      {
        kind: 'script',
        source: 'content',
        content: 'test',
      },
    ],
    'test-key',
  );

  expect(results.length).toBe(1);
  expect(results[0].key).toBe('test-key');
});

test('AssetsDependencyService - createWithDefaultProcessors', () => {
  const service = AssetsDependencyService.createWithDefaultProcessors(mockConfig);
  expect([...service.getRegistry().getAllProcessors().values()].length).toBeGreaterThan(0);
});
