import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, customElement, prop } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import { callAgentTool } from '../../lib/agents/agent-tool-client';
import { announceAssistantCartChange } from '../../lib/agents/assistant-cart-change';
import {
	type ToolInput,
	agentToolConfig,
	askBusinessTool,
	browseStoreTool,
	createCartTool,
	getProductTool,
	getUcpProfileTool,
	searchCatalogTool,
} from '../../lib/agents/store-tool-definitions';

/**
 * Offers the storefront's catalog and store tools (the Shopify storefront set: search, browse, product, store
 * questions and the first cart) to an agent through WebMCP while it is on the page.
 *
 * @remarks
 * It sits in the layout with `data-eco-persist`, so the browser router keeps it, and its tools, across client
 * navigations. Each tool is a method decorated with `@agentTool` of the shared definition, so Radiant registers it
 * while the host is connected; the tools that follow the visitor's page and cart live on `<cart-form>` and
 * `<cart-count>`. Where the browser has no `document.modelContext` Radiant registers nothing, so there is no request
 * and no log. Tools run on the server through `/api/agent-tools`, which validates the input again.
 */
type StoreAgentToolsProps = {
	/** Whether the store is a connected Shopify store, which has a UCP profile for `get_ucp_profile` to read. */
	ucp?: boolean;
};

@customElement('store-agent-tools')
export class StoreAgentTools extends RadiantElement {
	@prop({ type: Boolean, defaultValue: false })
	ucp!: boolean;

	@agentTool(agentToolConfig(searchCatalogTool))
	searchCatalog(input: ToolInput<typeof searchCatalogTool>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(searchCatalogTool.name, input, signal);
	}

	@agentTool(agentToolConfig(browseStoreTool))
	browseStore(input: ToolInput<typeof browseStoreTool>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(browseStoreTool.name, input, signal);
	}

	@agentTool(agentToolConfig(getProductTool))
	getProduct(input: ToolInput<typeof getProductTool>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(getProductTool.name, input, signal);
	}

	@agentTool(agentToolConfig(askBusinessTool))
	askBusiness(input: ToolInput<typeof askBusinessTool>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(askBusinessTool.name, input, signal);
	}

	@agentTool(agentToolConfig(createCartTool))
	createCart(input: ToolInput<typeof createCartTool>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(createCartTool.name, input, signal, { onCartChange: announceAssistantCartChange });
	}

	/**
	 * @remarks
	 * Registered only while `ucp` is set, which the layout does for a connected Shopify store: the demo catalog has no
	 * UCP profile to read.
	 */
	@agentTool({ ...agentToolConfig(getUcpProfileTool), getEnabled: (host: StoreAgentTools) => host.ucp })
	getUcpProfile(input: ToolInput<typeof getUcpProfileTool>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(getUcpProfileTool.name, input, signal);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'store-agent-tools': JsxCustomElementAttributes<StoreAgentTools, StoreAgentToolsProps>;
	}
}
