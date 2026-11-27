import type { AgentToolConfig, AgentToolHost } from '@ecopages/radiant/helpers/create-agent-tool';
import type { AgentToolParse } from '@ecopages/radiant/helpers/register-agent-tool';
import type * as z from 'zod/mini';
import { modelContextPresent } from './model-context';
import type { toolsByName } from './store-tool-definitions';
import type { StoreToolInfo } from './store-tool-info';

type ToolsByName = typeof toolsByName;
type ToolName = keyof ToolsByName & string;

/** The info of a tool that has a schema: its name is one of {@link toolsByName}. */
type KnownToolInfo = StoreToolInfo & { name: ToolName };

/**
 * What a tool's Radiant host method receives: the input its schema parses, found from the tool's info.
 */
export type ToolInputOf<Info extends KnownToolInfo> = z.output<ToolsByName[Info['name']]['input']>;

/**
 * What `@agentTool` takes for a store tool: its definition without `execute`, which the host's decorated method
 * supplies, and with the schema as `inputSchema` and `parse` promises, which load it only when the tool registers.
 * It has no `outputSchema`.
 */
export type StoreAgentToolConfig<Input, Host extends AgentToolHost> = Omit<
	AgentToolConfig<Host, Input>,
	'execute' | 'inputSchema' | 'outputSchema' | 'parse'
> & {
	inputSchema(): Promise<Record<string, unknown>>;
	readonly parse: Promise<AgentToolParse<Input>>;
};

/**
 * The config a Radiant host passes to `@agentTool`, for the tool `info` describes.
 *
 * @param info What the tool says about itself, from `store-tool-info.ts`. Its name finds the schema.
 * @param options `getEnabled` replaces the default, which follows {@link modelContextPresent}.
 *
 * @remarks
 * Radiant reads `inputSchema` and `parse` each time the tool registers, never without `document.modelContext`, and
 * accepts a promise from either. Both load `store-tool-definitions.ts` with `import()`, so the schema library is a
 * chunk that only a browser with WebMCP downloads; the browser loads that module once, for all tools. This module
 * imports nothing from it except types, which is why a host imports its `info` from `store-tool-info.ts` and takes
 * the type of a tool's input from {@link ToolInputOf}.
 *
 * Radiant runs `parse` on an agent's input in the browser, before the method runs and before a request is made; the
 * server checks it again, since a client can skip the browser. The UI calls the method with values of its own. The
 * default `getEnabled` lets the tool register when `document.modelContext` appears after the host connected. Do not
 * spread the returned config into another object: that calls the `parse` getter and loads the chunk at once. Pass
 * `options` instead.
 */
export function agentToolConfig<Info extends KnownToolInfo, Host extends AgentToolHost = AgentToolHost>(
	info: Info,
	options: { getEnabled?: (host: Host) => boolean } = {},
): StoreAgentToolConfig<ToolInputOf<Info>, Host> {
	const { readOnlyHint, consequentialHint, untrustedContentHint } = info.annotations;
	const annotations = Object.fromEntries(
		Object.entries({ readOnlyHint, consequentialHint, untrustedContentHint }).filter(
			([, hint]) => hint !== undefined,
		),
	);
	const load = () => import('./store-tool-definitions');
	return {
		name: info.name,
		title: info.title,
		description: info.description,
		annotations,
		getEnabled: options.getEnabled ?? (() => modelContextPresent.get()),
		inputSchema: async () => {
			const definitions = await load();
			return definitions.inputJsonSchema(definitions.toolsByName[info.name]);
		},
		get parse() {
			return load().then((definitions) => {
				const tool = definitions.toolsByName[info.name];
				return (input: unknown) => definitions.readToolInput(tool, input) as ToolInputOf<Info>;
			});
		},
	};
}
