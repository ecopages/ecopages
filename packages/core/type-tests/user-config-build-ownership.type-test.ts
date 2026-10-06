import { defineConfig } from '@ecopages/core/config';

defineConfig({
	// @ts-expect-error build ownership is set by the host that loads the config, not by the app
	buildOwnership: 'rolldown',
});
