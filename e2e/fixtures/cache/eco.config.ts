import { defineConfig } from '@ecopages/core/config';
import { createStringMarkupIntegration } from '@ecopages/testing';

export default defineConfig({
	rootDir: import.meta.dirname,
	integrations: [createStringMarkupIntegration({ extensions: ['.ts'] })],
});
