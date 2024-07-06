import { describe, expect, test } from 'bun:test';
import { FIXTURE_APP_PROJECT_DIR } from '../../../fixtures/constants.ts';
import { AppConfigurator } from '../../main/app-configurator.ts';
import { ServerUtils } from './server-utils.module.ts';

await AppConfigurator.create({
  projectDir: FIXTURE_APP_PROJECT_DIR,
});

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
