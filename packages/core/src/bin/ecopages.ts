#!/usr/bin/env bun
import { $ } from 'bun';
const args = process.argv.slice(2);

const { buildApp: buildAll } = await import('../main/build-app.js');

switch (args[0]) {
  case 'dev':
    await buildAll({ config: process.cwd(), watch: false, serve: false, build: false });
    break;
  case 'build':
    await buildAll({ config: process.cwd(), watch: false, serve: false, build: true });
    break;
  case 'preview':
    await buildAll({ config: process.cwd(), watch: false, serve: true, build: false });
    break;
  case 'start':
    await buildAll({ config: process.cwd(), watch: false, serve: true, build: false });
    break;
  default:
    console.log('[ecopages] Command not found');
}
