import { beforeEach, describe, expect, test } from 'bun:test';
import type { BunPlugin } from 'bun';
import type { EcoPagesAppConfig } from '../internal-types';
import { Processor, type ProcessorConfig } from './processor';

class TestProcessor extends Processor {
  buildPlugins?: BunPlugin[] = [];
  plugins?: BunPlugin[] = [];

  async setup(): Promise<void> {}
  async process(input: unknown): Promise<unknown> {
    return input;
  }
  async teardown(): Promise<void> {}
}

describe('Processor', () => {
  let processor: TestProcessor;
  let config: ProcessorConfig;
  let appConfig: EcoPagesAppConfig;

  beforeEach(() => {
    config = {
      name: 'test-processor',
      options: { test: true },
      watch: {
        paths: ['/test'],
      },
    };

    appConfig = {
      rootDir: '/root',
      absolutePaths: {
        srcDir: '/root/src',
        distDir: '/root/dist',
      },
    } as EcoPagesAppConfig;

    processor = new TestProcessor(config);
  });

  test('should initialize with correct name', () => {
    expect(processor.getName()).toBe('test-processor');
  });

  test('should return watch config', () => {
    expect(processor.getWatchConfig()).toEqual({
      paths: ['/test'],
    });
  });
});
