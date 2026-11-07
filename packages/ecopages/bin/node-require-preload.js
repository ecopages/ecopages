import { path } from '@ecopages/file-system/path';
import { createRequire } from 'node:module';

globalThis.require = createRequire(path.join(path.cwd(), 'package.json'));
