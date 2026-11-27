import { RadiantElement, customElement, prop } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import { navigate } from '@/lib/browser/navigation';
import { browseStore, getCart, getProduct, openProduct, searchCatalog } from '@/lib/webmcp/catalog-tools';
import {
	browseStoreTool,
	getCartTool,
	getProductTool,
	openProductTool,
	searchCatalogTool,
} from '@/lib/webmcp/definitions';

/**
 * `<store-agent-tools>`: the WebMCP tools every page offers, registered while the element is on the page.
 *
 * @remarks
 * The layout renders it with the collection and category the page shows, so `browse_store` without input
 * browses where the visitor is. A client navigation replaces the element, which unregisters the tools and
 * registers them again with the new place. Every tool goes through the same Endpoints the pages use and returns
 * only what the visitor could see. Where the browser has no `document.modelContext`, nothing is registered.
 */
@customElement('store-agent-tools')
export class StoreAgentToolsElement extends RadiantElement {
	@prop({ type: String, defaultValue: '' }) collection = '';
	@prop({ type: String, defaultValue: '' }) category = '';

	@agentTool(searchCatalogTool)
	searchCatalog(input: unknown, { signal }: AgentToolExecuteOptions) {
		return searchCatalog(input, { fetch, signal });
	}

	@agentTool(browseStoreTool)
	browseStore(input: unknown, { signal }: AgentToolExecuteOptions) {
		const place = { collection: this.collection || undefined, category: this.category || undefined };
		return browseStore(input, place, { fetch, signal });
	}

	@agentTool(getProductTool)
	getProduct(input: unknown, { signal }: AgentToolExecuteOptions) {
		return getProduct(input, { fetch, signal });
	}

	@agentTool(openProductTool)
	openProduct(input: unknown, { signal }: AgentToolExecuteOptions) {
		return openProduct(input, { fetch, signal, navigate });
	}

	@agentTool(getCartTool)
	getCart(input: unknown, { signal }: AgentToolExecuteOptions) {
		return getCart(input, { fetch, signal });
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'store-agent-tools': StoreAgentToolsElement;
	}
}
