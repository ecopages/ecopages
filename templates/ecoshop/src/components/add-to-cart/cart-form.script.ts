import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, bindTo, customElement, onEvent, prop, state } from '@ecopages/radiant';
import { CART_CHANGE_EVENT, type CartTotals } from '../../lib/cart/cart-events';

type CartFormProps = {
	/** Status text after a successful submit. */
	success?: string;
};

/**
 * Enhances the cart form it wraps: posts it with `fetch`, reports the result in place and tells the header count.
 *
 * @remarks
 * The form inside is a complete, working form, so it posts and redirects normally before this script loads or
 * when JavaScript is off. Once the host has sent a change it never posts it again: a failed `fetch` may still have
 * reached the server, so every failure is reported in place and the shopper decides whether to retry.
 */
@customElement('cart-form')
export class CartForm extends RadiantElement {
	@prop({ type: String, defaultValue: 'Cart updated.' })
	success!: string;

	@state
	@bindTo<string>({ ref: 'status', text: true })
	protected status = '';

	@state
	@bindTo<boolean>([
		{ ref: 'submit', bool: 'disabled' },
		{ ref: 'submit', attr: 'aria-busy', map: (pending) => (pending ? 'true' : null) },
	])
	protected pending = false;

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
		this.status = this.success;
		window.dispatchEvent(new CustomEvent<CartTotals>(CART_CHANGE_EVENT, { detail: result }));
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'cart-form': JsxCustomElementAttributes<CartForm, CartFormProps>;
	}
}
