import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, customElement, prop } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import { callAgentTool } from '../../lib/agents/agent-tool-client';
import { announceAssistantCartChange } from '../../lib/agents/assistant-cart-change';
import { modelContextPresent } from '../../lib/agents/model-context';
import { agentToolConfig, type ToolInputOf } from '../../lib/agents/agent-tool-config';
import {
	askBusinessInfo,
	browseStoreInfo,
	createCartInfo,
	getProductInfo,
	getUcpProfileInfo,
	searchCatalogInfo,
} from '../../lib/agents/store-tool-info';

type StoreAgentToolsProps = {
	/** Whether the store is a connected Shopify store, which has a UCP profile for `get_ucp_profile` to read. */
	ucp?: boolean;
};

/**
 * Offers the storefront's catalog and store tools (the Shopify storefront set: search, browse, product, store
 * questions and the first cart) to an agent through WebMCP while it is on the page.
 *
 * @remarks
 * It sits in the layout with `data-eco-persist`, so the browser router keeps it, and its tools, across client
 * navigations. Each tool is a method decorated with `@agentTool` of the shared definition, so Radiant registers it
 * while the host is connected; the tools that follow the visitor's page and cart live on `<cart-form>` and
 * `<cart-count>`. Where the browser has no `document.modelContext` Radiant registers nothing, so there is no request
 * and no log. Tools run on the server through `/api/agent-tools`, which validates the input.
 */
@customElement('store-agent-tools')
export class StoreAgentTools extends RadiantElement {
	@prop({ type: Boolean, defaultValue: false })
	ucp!: boolean;

	@agentTool(agentToolConfig(searchCatalogInfo))
	searchCatalog(input: ToolInputOf<typeof searchCatalogInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(searchCatalogInfo.name, input, signal);
	}

	@agentTool(agentToolConfig(browseStoreInfo))
	browseStore(input: ToolInputOf<typeof browseStoreInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(browseStoreInfo.name, input, signal);
	}

	@agentTool(agentToolConfig(getProductInfo))
	getProduct(input: ToolInputOf<typeof getProductInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(getProductInfo.name, input, signal);
	}

	@agentTool(agentToolConfig(askBusinessInfo))
	askBusiness(input: ToolInputOf<typeof askBusinessInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(askBusinessInfo.name, input, signal);
	}

	@agentTool(agentToolConfig(createCartInfo))
	createCart(input: ToolInputOf<typeof createCartInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(createCartInfo.name, input, signal, { onCartChange: announceAssistantCartChange });
	}

	/**
	 * @remarks
	 * Registered only while `ucp` is set, which the layout does for a connected Shopify store: the demo catalog has no
	 * UCP profile to read.
	 */
	@agentTool(
		agentToolConfig(getUcpProfileInfo, {
			getEnabled: (host: StoreAgentTools) => modelContextPresent.get() && host.ucp,
		}),
	)
	getUcpProfile(input: ToolInputOf<typeof getUcpProfileInfo>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(getUcpProfileInfo.name, input, signal);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'store-agent-tools': JsxCustomElementAttributes<StoreAgentTools, StoreAgentToolsProps>;
	}
}
