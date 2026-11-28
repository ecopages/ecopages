import type { AgentToolConfig, AgentToolHost } from '@ecopages/radiant/helpers/create-agent-tool';
import type * as z from 'zod/mini';
import { modelContextPresent } from './model-context';
import { storeToolSchemas } from './store-tool-schemas';
import type { toolsByName } from './store-tool-definitions';
import type { StoreToolInfo } from './store-tool-info';

type ToolsByName = typeof toolsByName;
type ToolName = keyof ToolsByName & string;

/** The info of a tool that has a schema: its name is one of {@link toolsByName}. */
type KnownToolInfo = StoreToolInfo & { name: ToolName };

/**
 * What a tool's Radiant host method receives: the input its schema accepts, found from the tool's info. It is the
 * input as sent, not parsed, so a schema's defaults are not applied until the server parses it.
 */
export type ToolInputOf<Info extends KnownToolInfo> = z.input<ToolsByName[Info['name']]['input']>;

/**
 * What `@agentTool` takes for a store tool: its definition without `execute`, which the host's decorated method
 * supplies. `Input` types that method's argument; the config has no `parse` and no `outputSchema`.
 */
export type StoreAgentToolConfig<Input, Host extends AgentToolHost> = Omit<AgentToolConfig<Host, Input>, 'execute'>;

/**
 * The config a Radiant host passes to `@agentTool`, for the tool `info` describes.
 *
 * @param info What the tool says about itself, from `store-tool-info.ts`. Its name finds the schema.
 * @param options `getEnabled` replaces the default, which follows {@link modelContextPresent}.
 *
 * @remarks
 * The input schema is the static JSON Schema in `store-tool-schemas.ts`, written from the Zod definitions in
 * `store-tool-definitions.ts` by `pnpm schemas` and kept in step by a test. This module imports nothing from the
 * definitions except types, which is why a host imports its `info` from `store-tool-info.ts` and takes the type of a
 * tool's input from {@link ToolInputOf}: the schema library never reaches the browser, with or without WebMCP.
 *
 * The config has no `parse`. The schema only tells an agent what to send; `/api/agent-tools/<name>` validates the
 * input with Zod, where the tool runs, and answers input it refuses with a tool error naming the first invalid fields, which the
 * host's method returns to the agent. The UI calls the method with values of its own. The default `getEnabled` lets
 * the tool register when `document.modelContext` appears after the host connected.
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
	return {
		name: info.name,
		title: info.title,
		description: info.description,
		annotations,
		inputSchema: storeToolSchemas[info.name],
		getEnabled: options.getEnabled ?? (() => modelContextPresent.get()),
	};
}
