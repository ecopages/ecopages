import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, bindTo, customElement, onEvent, prop, query, state } from '@ecopages/radiant';
import { createAgentTool } from '@ecopages/radiant/helpers/create-agent-tool';
import '@ecopages/radiant-ui/radio-group';
import { toast } from '@ecopages/radiant-ui/toast';
import { callAgentTool, hasModelContext, loadAgentToolDescriptors } from '../../lib/agents/agent-tool-client';
import { CART_CHANGE_EVENT, type CartTotals } from '../../lib/cart/cart-events';

type CartFormProps = {
	/** Toast title after a successful add. */
	success?: string;
	/** The product's title. A form with one is the product form, which offers `add_to_cart` to an agent. */
	productTitle?: string;
};

/**
 * The product form's host: it adds to the cart in place for the shopper, and offers the same action to an
 * in-browser agent as the WebMCP tool `add_to_cart` while the form is on the page.
 *
 * @remarks
 * The form inside is a complete, working form, so it posts and redirects normally before this script loads or
 * when JavaScript is off. Once the host has sent a change it never posts it again: a failed `fetch` may still have
 * reached the server, so every failure is reported in place and the shopper decides whether to retry. The agent's
 * call runs through `/api/agent-tools`, which validates it and checks the variant belongs to this product; the tool
 * is registered with `createAgentTool`, so a client navigation that removes the form unregisters it.
 */
@customElement('cart-form')
export class CartForm extends RadiantElement {
	@prop({ type: String, defaultValue: 'Added to your cart' })
	success!: string;

	@prop({ type: String, defaultValue: '' })
	productTitle!: string;

	@state
	@bindTo<string>({ ref: 'status', text: true })
	protected status = '';

	@state
	@bindTo<boolean>([
		{ ref: 'submit', bool: 'disabled' },
		{ ref: 'submit', attr: 'aria-busy', map: (pending) => (pending ? 'true' : null) },
	])
	protected pending = false;

	@query('rui-radio-group')
	private variantPicker!: (HTMLElement & { value: string }) | null;

	private toolRegistered = false;

	protected override onConnected(): void {
		this.selectVariantFromUrl();
		if (!this.toolRegistered && this.productTitle && hasModelContext()) {
			this.toolRegistered = true;
			void this.registerAddToCart();
		}
	}

	/**
	 * Selects the variant a `?variant=` link names, as the `show_variant` tool opens it.
	 */
	private selectVariantFromUrl(): void {
		const variant = new URLSearchParams(location.search).get('variant');
		const picker = this.variantPicker;
		if (!variant || !picker) return;
		const radio = picker.querySelector<HTMLInputElement>(`input[type="radio"][value="${CSS.escape(variant)}"]`);
		if (radio && !radio.disabled) picker.value = variant;
	}

	private async registerAddToCart(): Promise<void> {
		const descriptors = await loadAgentToolDescriptors().catch(() => []);
		const descriptor = descriptors.find((entry) => entry.name === 'add_to_cart');
		if (!descriptor) return;
		createAgentTool(this, {
			...descriptor,
			description: this.productTitle
				? `${descriptor.description} The product on this page is ${this.productTitle}.`
				: descriptor.description,
			execute: (input, { signal }) =>
				callAgentTool('add_to_cart', input, signal, {
					onCartChange: (totals) => this.announce('Your assistant added this to your cart', totals),
				}),
		});
	}

	private announce(title: string, totals: CartTotals): void {
		this.status = '';
		toast.success(title, {
			description: `${totals.totalQuantity} item(s) in your cart${totals.subtotal ? `, ${totals.subtotal}` : ''}`,
		});
	}

	@onEvent({ selector: 'form', type: 'submit' })
	async onSubmit(event: SubmitEvent) {
		const form = event.target;
		if (!(form instanceof HTMLFormElement)) return;
		event.preventDefault();
		if (this.pending) return;
		this.pending = true;
		this.status = '';
		let response: Response;
		try {
			response = await fetch(form.action, {
				method: 'POST',
				headers: { Accept: 'application/json' },
				body: new FormData(form, event.submitter),
			});
		} catch {
			this.pending = false;
			this.status = 'The store could not be reached. Check your cart before trying again.';
			return;
		}
		const result = (await response.json().catch(() => null)) as (CartTotals & { error?: string }) | null;
		this.pending = false;
		if (!response.ok || !result) {
			this.status = result?.error ?? 'The cart could not be updated. Reload the page and try again.';
			return;
		}
		window.dispatchEvent(new CustomEvent<CartTotals>(CART_CHANGE_EVENT, { detail: result }));
		this.announce(this.success, result);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'cart-form': JsxCustomElementAttributes<CartForm, CartFormProps>;
	}
}
