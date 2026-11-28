import { describe, expect, it } from 'vitest';
import { agentToolConfig } from './agent-tool-config';
import { storeToolSchemas } from './store-tool-schemas';
import { toolsByName } from './store-tool-definitions';
import { addToCartInfo, getProductInfo } from './store-tool-info';
import { storeTools } from './store-tools.server';

describe('store tool definitions', () => {
	it('give each tool of a page its static JSON Schema and an annotation that says what it changes', () => {
		for (const tool of Object.values(toolsByName).filter((entry) => entry.surfaces.includes('page'))) {
			const config = agentToolConfig(tool);

			expect(config.name).toBe(tool.name);
			expect(config.inputSchema).toBe(storeToolSchemas[tool.name as keyof typeof storeToolSchemas]);
			expect(tool.description.length).toBeLessThanOrEqual(500);
			const annotations = config.annotations ?? {};
			expect('readOnlyHint' in annotations || 'consequentialHint' in annotations).toBe(true);
			expect(annotations).not.toHaveProperty('destructiveHint');
		}
	});

	it('leave the validation of an agents input to the server, so the config has no parse', () => {
		expect(agentToolConfig(getProductInfo)).not.toHaveProperty('parse');
	});

	it('keep a tool unavailable where the browser has no WebMCP', () => {
		expect(agentToolConfig(addToCartInfo).getEnabled?.({} as never)).toBe(false);
	});

	it('give the tools of a page the ones the server runs, under the same names', () => {
		const names = Object.values(toolsByName).map((tool) => tool.name);

		expect(storeTools.map((tool) => tool.name).sort()).toEqual(names.sort());
	});
});
