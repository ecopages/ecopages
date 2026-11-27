import { describe, expect, it } from 'vitest';
import { agentToolConfig } from './agent-tool-config';
import { inputJsonSchema, readToolInput, toolsByName } from './store-tool-definitions';
import { addToCartInfo, getProductInfo } from './store-tool-info';
import { storeTools } from './store-tools.server';

const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';
const { add_to_cart: addToCartTool } = toolsByName;

describe('store tool definitions', () => {
	it('give each tool of a page a JSON Schema and an annotation that says what it changes', async () => {
		for (const tool of Object.values(toolsByName).filter((entry) => entry.surfaces.includes('page'))) {
			const config = agentToolConfig(tool);
			const inputSchema = await config.inputSchema();

			expect(config.name).toBe(tool.name);
			expect(inputSchema).toEqual(inputJsonSchema(tool));
			expect(inputSchema).toMatchObject({ type: 'object' });
			expect(inputSchema).not.toHaveProperty('$schema');
			expect(tool.description.length).toBeLessThanOrEqual(500);
			const annotations = config.annotations ?? {};
			expect('readOnlyHint' in annotations || 'consequentialHint' in annotations).toBe(true);
			expect(annotations).not.toHaveProperty('destructiveHint');
		}
	});

	it('keep a tool unavailable where the browser has no WebMCP', () => {
		expect(agentToolConfig(addToCartInfo).getEnabled?.({} as never)).toBe(false);
	});

	it('give the tools of a page the ones the server runs, under the same names', () => {
		const names = Object.values(toolsByName).map((tool) => tool.name);

		expect(storeTools.map((tool) => tool.name).sort()).toEqual(names.sort());
	});
});

describe('the input an agent sends a host', () => {
	it('is the schema parsed, with its defaults applied', async () => {
		const parse = await agentToolConfig(getProductInfo).parse;

		expect(parse({})).toEqual({ catalog: {} });
		expect(parse({ catalog: { id: 'field-shirt' } })).toEqual({ catalog: { id: 'field-shirt' } });
	});

	it('is refused with the field named, so the agent can correct the call', async () => {
		const parse = await agentToolConfig(addToCartInfo).parse;

		expect(() => parse({ item: { id: fieldShirtM }, quantity: 0 })).toThrow(/^Invalid input\. quantity: /u);
		expect(() => readToolInput(addToCartTool, { quantity: 1 })).toThrow(/item/u);
	});
});
