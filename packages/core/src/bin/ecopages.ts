#!/usr/bin/env bun
const args = process.argv.slice(2);

const { buildApp } = await import('../main/build-app.js');

switch (args[0]) {
  case 'dev':
    import.meta.env.NODE_ENV = 'development';
    await buildApp({ config: process.cwd(), watch: true, serve: false, build: false });
    break;
  case 'build':
    await buildApp({ config: process.cwd(), watch: false, serve: false, build: true });
    break;
  case 'preview':
    await buildApp({ config: process.cwd(), watch: false, serve: false, build: false });
    break;
  case 'start':
    import.meta.env.NODE_ENV = 'development';
    await buildApp({ config: process.cwd(), watch: false, serve: true, build: false });
    break;
  default:
    console.log('[ecopages] Command not found');
}

export type {};
