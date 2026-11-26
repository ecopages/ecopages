# Agent tools (experimental)

Offer page actions to a browser agent as [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools on `document.modelContext`, so the agent calls a method instead of finding and clicking the DOM. WebMCP is an origin trial; the API may change. Where the browser has no `document.modelContext`, and on the server, registration does nothing.

Docs: [@agentTool](https://radiant.ecopages.app/docs/decorators/agent-tool) and the [Agent tools recipe](https://radiant-ui.ecopages.app/docs/recipes/agent-tools).

## Contents

- Three layers
- Config
- Rules
- Security

## Three layers

| Use                             | From                                            | When                                                                                                                             |
| ------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@agentTool(config)`            | `@ecopages/radiant/decorators/agent-tool`       | A method that is both a normal method the UI calls and a tool the agent calls. The method is `execute` and stays callable.       |
| `createAgentTool(host, config)` | `@ecopages/radiant/helpers/create-agent-tool`   | The same host lifecycle for a tool that is not one method, such as a controller or a field. Returns a function that disposes it. |
| `registerAgentTool(config)`     | `@ecopages/radiant/helpers/register-agent-tool` | A tool outside any host, such as a store or a page script. Returns its unregister function; calling it again does nothing.       |

None of them is exported from the root entry, so a page that does not use agent tools pays nothing.

```ts
import { RadiantElement, customElement } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import { z } from 'zod';

const AddItem = z.object({ sku: z.string() });

@customElement('shop-cart')
export class ShopCart extends RadiantElement {
	items: { sku: string }[] = [];

	@agentTool({
		name: (host: ShopCart) => `add_to_cart_${host.id}`,
		description: 'Adds a product to the cart by its SKU.',
		annotations: { consequentialHint: false },
		inputSchema: z.toJSONSchema(AddItem),
		parse: AddItem.parse,
	})
	addItem(item: z.infer<typeof AddItem>) {
		this.items = [...this.items, item];
		return { count: this.items.length };
	}
}
```

The form submit calls `addItem` with a typed value and the agent calls the same method, so the two paths cannot drift. `createAgentTool` takes the same config plus `execute(input, { signal })`; `registerAgentTool` takes a plain `name` and no `getEnabled`.

```ts
import { registerAgentTool } from '@ecopages/radiant/helpers/register-agent-tool';

const unregister = registerAgentTool({
	name: 'clear_filters',
	description: 'Clears every filter on the product list.',
	annotations: { readOnlyHint: false, consequentialHint: false },
	execute: () => {
		filters.clear();
		return { cleared: true };
	},
});
```

## Config

The config is the WebMCP tool dictionary passed through (`name`, `description`, `title`, `inputSchema`, `outputSchema`, `annotations`, `exposedTo`), plus:

- `parse(input: unknown)` validates the agent's input before the method runs and throws to reject the call. Pass a schema library's `schema.parse` (Zod, Valibot, ArkType, or hand-written). Under standard decorators it also types the method's argument. Without it the input arrives unchecked. `inputSchema` is plain JSON Schema and advisory only; Radiant ships no schema library.
- `getEnabled(host)` registers the tool only while it returns `true` (`@agentTool` and `createAgentTool`).
- `name` may be a function of the host. `name` and `getEnabled` are read after the host's attributes have caught up and again when a signal they read changes, which registers the tool again. Annotate the host parameter (`(host: ShopCart) => ...`): the decorator config is written before TypeScript knows the class.

## Rules

- Tool names are unique per page. A second registration under the same name is rejected, and Radiant reports it with `console.error` naming the tool and the element. A component that can appear twice builds its name from an instance value such as `id`, or one owner registers a shared capability once.
- The tool is registered while the host is connected (and enabled) and removed when it disconnects. Every connect registers with a new `AbortController`, because WebMCP removes a tool only by aborting its signal; a decorated method receives `{ signal }` as its second argument.
- Return only once the UI shows the change, and return a value that says what happened: the agent reads it, and a rejection reaches the agent as an error.
- A server-rendered element whose children come from its parent's view registers only after it hydrates, and never when the parent does not render on the client.
- A tool registered inside a cross-origin iframe needs `allow="tools"` on the frame.

## Security

A tool runs page code for an agent, with the page's cookies and DOM, and what it returns can leave the device.

- **Return the least.** Never return tokens, secrets, or the contents of password, card or one-time-code fields.
- **Ask for the least.** Do not ask the agent for personal context (age, location, history) the action does not need.
- **Say what it changes.** Set `readOnlyHint` for a tool that changes nothing, `consequentialHint` for a high-stakes or irreversible one, and `untrustedContentHint` when the output carries text another user or site wrote.
- **Validate in code, authorize on the server.** The agent can skip every check the UI does. A consequential tool confirms in the app's own UI inside `execute` (WebMCP has no confirmation API) and closes that UI when the `signal` aborts.
- **Keep `exposedTo` closed.** Tools are visible only to the page's own origin unless `exposedTo` lists other secure origins.

In development, a tool with a missing annotation, text over the sizes Chrome recommends, an `exposedTo` list, or output over 1,500 characters logs a warning once. Radiant never logs what the agent sends or the tool returns.
