import { describe, expect, it } from 'vitest';
import {
	getEcopagesEnv,
	getNodeEnvironment,
	isDevelopmentRuntime,
	isEcopagesEnvDisabled,
	isEcopagesEnvEnabled,
	isProductionRuntime,
} from './env.ts';

describe('environment accessors', () => {
	it('reads declared Ecopages values from the supplied environment', () => {
		expect(getEcopagesEnv('ECOPAGES_BASE_URL', { ECOPAGES_BASE_URL: 'https://example.test' })).toBe(
			'https://example.test',
		);
	});

	it.each(['true', '1'])('treats %s as an enabled boolean value', (value) => {
		expect(isEcopagesEnvEnabled('ECOPAGES_LOGGER_DEBUG', { ECOPAGES_LOGGER_DEBUG: value })).toBe(true);
	});

	it.each(['false', '0', '', undefined])('treats %s as a disabled boolean value', (value) => {
		expect(isEcopagesEnvEnabled('ECOPAGES_LOGGER_DEBUG', { ECOPAGES_LOGGER_DEBUG: value })).toBe(false);
	});

	it.each(['false', '0'])('treats %s as an explicitly disabled value', (value) => {
		expect(isEcopagesEnvDisabled('ECOPAGES_UNIFIED_PAGES_GRAPH', { ECOPAGES_UNIFIED_PAGES_GRAPH: value })).toBe(
			true,
		);
	});

	it.each(['true', '1'])('does not treat %s as explicitly disabled', (value) => {
		expect(isEcopagesEnvDisabled('ECOPAGES_UNIFIED_PAGES_GRAPH', { ECOPAGES_UNIFIED_PAGES_GRAPH: value })).toBe(
			false,
		);
	});

	it('does not treat an unset variable as explicitly disabled', () => {
		expect(isEcopagesEnvDisabled('ECOPAGES_UNIFIED_PAGES_GRAPH', {})).toBe(false);
	});

	it('centralizes runtime mode checks', () => {
		expect(getNodeEnvironment({ NODE_ENV: 'development' })).toBe('development');
		expect(isDevelopmentRuntime({ NODE_ENV: 'development' })).toBe(true);
		expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
		expect(isDevelopmentRuntime({ NODE_ENV: 'test' })).toBe(false);
	});
});
