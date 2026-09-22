import { defineConfig } from '@ecopages/core/config';
import { createCoreHmrUserConfig } from './fixture-user-config.ts';

export default defineConfig(createCoreHmrUserConfig({ withPostcss: true }));
