import { postcssProcessorPlugin } from '@ecopages/postcss-processor/plugin';
import { tailwindV3Preset } from '@ecopages/postcss-processor/presets/tailwind-v3';
import { createStringMarkupIntegration } from '@ecopages/testing';
import type { EcoPagesUserConfig } from '@ecopages/core/config';

export function createCoreHmrUserConfig(options: { withPostcss?: boolean } = {}): EcoPagesUserConfig {
	const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim();
	const config: EcoPagesUserConfig = {
		rootDir: import.meta.dirname,
		distDir: artifactScope ? `dist-${artifactScope}` : 'dist',
		workDir: artifactScope ? `.eco-${artifactScope}` : '.eco',
		integrations: [createStringMarkupIntegration({ extensions: ['.ts'] })],
		devPrewarmPaths: options.withPostcss ? ['/postcss-hmr'] : ['/'],
	};

	if (options.withPostcss) {
		config.processors = [postcssProcessorPlugin(tailwindV3Preset())];
	}

	return config;
}
