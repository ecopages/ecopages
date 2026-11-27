import { describe, expect, it } from 'vitest';
import {
	addToCartTool,
	agentToolConfig,
	getProductTool,
	inputJsonSchema,
	readToolInput,
	searchCatalogTool,
	storeToolSpecs,
	toolsOn,
} from './store-tool-definitions';
import { storeTools } from './store-tools.server';

const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';

describe('store tool definitions', () => {
	it('are the only source of the tools /mcp and the server run', () => {
		expect(storeTools.map((tool) => tool.name)).toEqual(storeToolSpecs.map((spec) => spec.name));
		for (const tool of storeTools) {
			const spec = storeToolSpecs.find((entry) => entry.name === tool.name);
			expect(tool.input).toBe(spec?.input);
			expect(tool.description).toBe(spec?.description);
			expect(tool.annotations).toBe(spec?.annotations);
		}
	});

	it('offer the page tools a host registers with the same name, description and schema', () => {
		for (const spec of toolsOn('page')) {
			const config = agentToolConfig(spec);

			expect(config.name).toBe(spec.name);
			expect(config.description).toBe(spec.description);
			expect(config.inputSchema).toEqual(inputJsonSchema(spec));
		}
	});

	it('describe each tool with JSON Schema and an annotation that says what it changes', () => {
		for (const spec of storeToolSpecs) {
			const config = agentToolConfig(spec);

			expect(config.inputSchema).toMatchObject({ type: 'object' });
			expect(config.inputSchema).not.toHaveProperty('$schema');
			expect(spec.description.length).toBeLessThanOrEqual(500);
			const annotations = config.annotations ?? {};
			expect('readOnlyHint' in annotations || 'consequentialHint' in annotations).toBe(true);
			expect(annotations).not.toHaveProperty('destructiveHint');
		}
	});

	it('builds a tool schema only when a host reads it', () => {
		const config = agentToolConfig(searchCatalogTool);

		expect(Object.getOwnPropertyDescriptor(config, 'inputSchema')?.get).toBeTypeOf('function');
		expect(config.inputSchema).toBe(config.inputSchema);
	});
});

describe('the input a host parses', () => {
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
