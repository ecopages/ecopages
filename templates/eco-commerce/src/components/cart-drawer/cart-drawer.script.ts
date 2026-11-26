import '@ecopages/radiant-ui/dialog';
import '@ecopages/radiant-ui/number-field';
import { RadiantElement, bindTo, customElement, onEvent, state } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import {
	CART_CHANGE_EVENT,
	OPEN_CART_EVENT,
	dispatchCartChange,
	type CartChangeDetail,
} from '@/lib/storefront/cart-events';
import type { CartJson } from '@/lib/storefront/json';
import { getCart, isToolError, postCartChange, readToolInput } from '@/lib/webmcp/catalog-tools';
import { openCartTool } from '@/lib/webmcp/definitions';
import './cart-lines.script';

/**
 * `<cart-drawer>`: the cart in a `RuiDialog`, opened from the header cart link.
 *
 * @remarks
 * The layout marks it `data-eco-persist`, so it lives across client navigations. It fetches the cart when it
 * opens and after each change it sends; without JavaScript the header link opens `/order` instead.
 */
@customElement('cart-drawer')
export class CartDrawerElement extends RadiantElement {
	@state
	@bindTo<boolean>({ selector: 'rui-dialog', prop: 'open' })
	protected open = false;

	@state
	@bindTo<CartJson | null>({ selector: 'cart-lines', prop: 'cart' })
	protected cart: CartJson | null = null;

	/** Opens the drawer and resolves once it shows the current cart. */
	async show(signal?: AbortSignal): Promise<CartJson | { error: string }> {
		this.open = true;
		const cart = await getCart({}, { fetch, signal });
		if (!isToolError(cart)) this.cart = cart;
		return cart;
	}

	@onEvent({ window: true, type: OPEN_CART_EVENT })
	onOpenRequest(): void {
		void this.show();
	}

	@onEvent({ selector: 'rui-dialog', type: 'rui-close' })
	onClose(): void {
		this.open = false;
	}

	@onEvent({ window: true, type: CART_CHANGE_EVENT })
	onCartChange(event: CustomEvent<CartChangeDetail>): void {
		if ('cart' in event.detail) this.cart = event.detail.cart;
	}

	@onEvent({ selector: 'rui-number-field', type: 'change' })
	onQuantityChange(event: Event): void {
		const field = event.target instanceof Element ? event.target.closest('rui-number-field') : null;
		const quantity = Number((field as { value?: number } | null)?.value);
		const variantId = field?.getAttribute('data-variant-id');
		if (variantId && quantity >= 1) void this.changeLine(variantId, quantity);
	}

	@onEvent({ selector: '[data-remove]', type: 'click' })
	onRemove(event: Event): void {
		const variantId = (event.target as Element).closest('[data-remove]')?.getAttribute('data-remove');
		if (variantId) void this.changeLine(variantId, 0);
	}

	private async changeLine(variantId: string, quantity: number): Promise<void> {
		const result = await postCartChange('/cart/update', { variantId, quantity }, { fetch });
		if (!isToolError(result)) dispatchCartChange({ cart: result });
	}

	@agentTool(openCartTool)
	openCartTool(input: unknown, { signal }: AgentToolExecuteOptions) {
		const values = readToolInput(openCartTool, input);
		return isToolError(values) ? values : this.show(signal);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'cart-drawer': CartDrawerElement;
	}
}
