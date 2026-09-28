import { defineConfig } from '@ecopages/core/config';
import { createStringMarkupIntegration } from '@ecopages/testing';

export default defineConfig({
	rootDir: import.meta.dir,
	integrations: [createStringMarkupIntegration({ extensions: ['.ts'] })],
});
