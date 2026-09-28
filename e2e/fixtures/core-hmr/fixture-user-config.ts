import { postcssProcessorPlugin } from '@ecopages/postcss-processor/plugin';
import { tailwindV3Preset } from '@ecopages/postcss-processor/presets/tailwind-v3';
import { createStringMarkupIntegration } from '@ecopages/testing';
import type { EcoPagesUserConfig } from '@ecopages/core/config';

export function createCoreHmrUserConfig(options: { withPostcss?: boolean } = {}): EcoPagesUserConfig {
	const config: EcoPagesUserConfig = {
		rootDir: import.meta.dirname,
		integrations: [createStringMarkupIntegration({ extensions: ['.ts'] })],
	};

	if (options.withPostcss) {
		config.processors = [postcssProcessorPlugin(tailwindV3Preset())];
	}

	return config;
}
