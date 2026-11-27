import { describe, expect, it } from 'vitest';
import {
	addToCartTool,
	agentToolConfig,
	getProductTool,
	inputJsonSchema,
	readToolInput,
} from './store-tool-definitions';
import { storeTools } from './store-tools.server';

const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';

describe('store tool definitions', () => {
	it('give each tool of a page a JSON Schema and an annotation that says what it changes', () => {
		for (const tool of storeTools.filter((entry) => entry.surfaces.includes('page'))) {
			const config = agentToolConfig(tool);

			expect(config.name).toBe(tool.name);
			expect(config.inputSchema).toEqual(inputJsonSchema(tool));
			expect(config.inputSchema).toMatchObject({ type: 'object' });
			expect(config.inputSchema).not.toHaveProperty('$schema');
			expect(tool.description.length).toBeLessThanOrEqual(500);
			const annotations = config.annotations ?? {};
			expect('readOnlyHint' in annotations || 'consequentialHint' in annotations).toBe(true);
			expect(annotations).not.toHaveProperty('destructiveHint');
		}
	});

	it('keep a tool unavailable where the browser has no WebMCP', () => {
		expect(agentToolConfig(addToCartTool).getEnabled?.({} as never)).toBe(false);
	});
});

describe('the input an agent sends a host', () => {
	it('is the schema parsed, with its defaults applied', () => {
		const parse = agentToolConfig(getProductTool).parse;

		expect(parse?.({})).toEqual({ catalog: {} });
		expect(parse?.({ catalog: { id: 'field-shirt' } })).toEqual({ catalog: { id: 'field-shirt' } });
	});

	it('is refused with the field named, so the agent can correct the call', () => {
		const parse = agentToolConfig(addToCartTool).parse;

		expect(() => parse?.({ item: { id: fieldShirtM }, quantity: 0 })).toThrow(/^Invalid input\. quantity: /u);
		expect(() => readToolInput(addToCartTool, { quantity: 1 })).toThrow(/item/u);
	});
});
