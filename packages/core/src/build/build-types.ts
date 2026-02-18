import type { BunPlugin } from 'bun';

export type EcoBuildPlugin = Pick<BunPlugin, 'name' | 'setup'>;
