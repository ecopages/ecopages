import { describe, expect, test } from 'bun:test';
import { FIXTURE_APP_PROJECT_DIR } from '../../fixtures/constants.ts';
import { AppConfigurator } from '../main/app-configurator.ts';
import { FSRouterScanner } from './fs-router-scanner.ts';

const appConfigurator = await AppConfigurator.create({
  projectDir: FIXTURE_APP_PROJECT_DIR,
});

const {
  templatesExt,
  absolutePaths: { pagesDir },
} = appConfigurator.config;

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
        filePath: `${pagesDir}/index.ghtml.ts`,
        kind: 'exact',
        pathname: '/',
      },
      'http://localhost:3000/404': {
        filePath: `${pagesDir}/404.ghtml.ts`,
        kind: 'exact',
        pathname: '/404',
      },
      'http://localhost:3000/catch-all/[...path]': {
        filePath: `${pagesDir}/catch-all/[...path].ghtml.ts`,
        kind: 'catch-all',
        pathname: '/catch-all/[...path]',
      },
      'http://localhost:3000/dynamic/another-blog-post': {
        filePath: `${pagesDir}/dynamic/[slug].ghtml.ts`,
        kind: 'dynamic',
        pathname: '/dynamic/[slug]',
      },
      'http://localhost:3000/dynamic/blog-post': {
        filePath: `${pagesDir}/dynamic/[slug].ghtml.ts`,
        kind: 'dynamic',
        pathname: '/dynamic/[slug]',
      },
    });
  });
});
