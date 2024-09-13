import { describe, expect, test } from 'bun:test';
import { FIXTURE_APP_BASE_URL, FIXTURE_APP_PROJECT_DIR } from '../../fixtures/constants.ts';
import { ConfigBuilder } from '../main/config-builder.ts';
import { ServerUtils } from './server-utils.module.ts';

await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).setBaseUrl(FIXTURE_APP_BASE_URL).build();

describe('ServerUtils', () => {
  test.each([
    ['/my-file.controller.js', 'text/javascript'],
    ['/my-file.css', 'text/css'],
    ['/my-file.html', 'text/html'],
    ['/my-file.json', 'application/json'],
    ['/my-file.png', 'image/png'],
    ['/my-file.jpg', 'image/jpeg'],
    ['/my-file.jpeg', 'image/jpeg'],
    ['/my-file.svg', 'image/svg+xml'],
    ['/my-file.gif', 'image/gif'],
    ['/my-file.ico', 'image/x-icon'],
    ['/my-file', 'text/plain'],
  ])('getContentType(%p) should return %p', (filePath, expected) => {
    expect(ServerUtils.getContentType(filePath)).toBe(expected);
  });
});
