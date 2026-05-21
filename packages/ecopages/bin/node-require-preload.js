import path from 'node:path';
import { createRequire } from 'node:module';

globalThis.require = createRequire(path.join(process.cwd(), 'package.json'));
