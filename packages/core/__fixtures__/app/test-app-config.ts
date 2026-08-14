import { createStringMarkupIntegration } from '@ecopages/testing';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigBuilder } from '../../src/config/config-builder';

/** Builds the fixture app configuration with its test-only template Integration. */
export function createFixtureAppConfig() {
	return new ConfigBuilder()
		.setRootDir(path.dirname(fileURLToPath(import.meta.url)))
		.setIntegrations([createStringMarkupIntegration({ extensions: ['.ts'] })])
		.build();
}
