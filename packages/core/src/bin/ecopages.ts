#!/usr/bin/env bun
const args = process.argv.slice(2);

const { buildAll } = await import('../main/build-all.js');

switch (args[0]) {
  case 'watch:dev':
    await buildAll({ config: process.cwd(), watch: true, serve: false, build: false });
    break;
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

export type {};
