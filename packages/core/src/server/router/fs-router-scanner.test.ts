import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { ConfigBuilder } from '@/build/config-builder';
import { FIXTURE_PROJECT_DIR } from 'fixtures/constants';
import { FSRouterScanner } from './fs-router-scanner';

await ConfigBuilder.create({
  projectDir: path.resolve(FIXTURE_PROJECT_DIR),
});

const {
  templatesExt,
  absolutePaths: { pagesDir },
} = globalThis.ecoConfig;

describe('FSRouterScanner', () => {
  test('when scan is called, it should return an object with routes', async () => {
    const scanner = new FSRouterScanner({
      dir: pagesDir,
      origin: 'http://localhost:3000',
      templatesExt,
      options: {
        buildMode: false,
      },
    });

    const routes = await scanner.scan();

    expect(routes).toEqual({
      'http://localhost:3000/': {
        filePath: `${pagesDir}/index.kita.tsx`,
        kind: 'exact',
        pathname: '/',
        src: 'http://localhost:3000/',
      },
      'http://localhost:3000/catch-all/[...path]': {
        filePath: `${pagesDir}/catch-all/[...path].kita.tsx`,
        kind: 'catch-all',
        pathname: '/catch-all/[...path]',
        src: 'http://localhost:3000/catch-all/[...path]',
      },
      'http://localhost:3000/dynamic/[slug]': {
        filePath: `${pagesDir}/dynamic/[slug].kita.tsx`,
        kind: 'dynamic',
        pathname: '/dynamic/[slug]',
        src: 'http://localhost:3000/dynamic/[slug]',
      },
    });
  });
});
