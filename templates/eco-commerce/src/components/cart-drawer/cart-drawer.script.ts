import '@ecopages/radiant-ui/dialog';
import '@ecopages/radiant-ui/number-field';
import { RadiantElement, bindTo, customElement, onEvent, state } from '@ecopages/radiant';
import { toast } from '@ecopages/radiant-ui/toast';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import {
	CART_CHANGE_EVENT,
	OPEN_CART_EVENT,
	dispatchCartChange,
	type CartChangeDetail,
} from '@/lib/storefront/cart-events';
import type { CartJson } from '@/lib/storefront/json';
import { isStoreError, postCartChange, type StoreError } from '@/lib/browser/store-api';
import { getCart, readToolInput } from '@/lib/webmcp/catalog-tools';
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
	async show(signal?: AbortSignal): Promise<CartJson | StoreError> {
		this.open = true;
		const cart = await getCart({}, { fetch, signal });
		if (!isStoreError(cart)) this.cart = cart;
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
		const input = field?.querySelector<HTMLInputElement>('input');
		const quantity = Number(input?.value);
		const variantId = field?.getAttribute('data-variant-id');
		if (variantId && quantity >= 1) void this.changeLine(variantId, quantity);
	}

	@onEvent({ selector: '[data-remove]', type: 'click' })
	onRemove(event: Event): void {
		const button = event.target instanceof Element ? event.target.closest('[data-remove]') : null;
		const variantId = button?.getAttribute('data-remove');
		if (variantId) void this.changeLine(variantId, 0);
	}

	/** The changes sent so far, chained so the next one waits for the answer to the previous one. */
	private pendingChanges: Promise<void> = Promise.resolve();

	/**
	 * Queues a line change behind the ones already sent.
	 *
	 * @remarks
	 * Sending one change at a time keeps the order the visitor made them in, both at the store and on screen, so
	 * the last answer shown is the cart the store holds. Two changes in flight at once could reach the store in
	 * either order, and their answers come back in either order too.
	 */
	private changeLine(variantId: string, quantity: number): Promise<void> {
		this.pendingChanges = this.pendingChanges.then(() => this.sendLineChange(variantId, quantity));
		return this.pendingChanges;
	}

	/**
	 * @remarks
	 * A refused or failed change shows the reason and puts the server's cart back on screen, so the drawer never
	 * shows a quantity the store did not save.
	 */
	private async sendLineChange(variantId: string, quantity: number): Promise<void> {
		const result = await postCartChange('/cart/update', { variantId, quantity }, { fetch });
		if (isStoreError(result)) toast.error(result.error);
		const cart = isStoreError(result) ? await getCart({}, { fetch }) : result;
		if (!isStoreError(cart)) dispatchCartChange({ cart });
	}

	@agentTool(openCartTool)
	openCartTool(input: unknown, { signal }: AgentToolExecuteOptions) {
		const values = readToolInput(openCartTool, input);
		return isStoreError(values) ? values : this.show(signal);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'cart-drawer': CartDrawerElement;
	}
}
