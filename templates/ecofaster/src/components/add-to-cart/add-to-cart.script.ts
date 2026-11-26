import { RadiantElement, bindTo, customElement, onEvent, ref, state } from '@ecopages/radiant';
import type { CartSummary } from '@/lib/cart/cart';
import { dispatchCartChange } from '@/lib/cart/cart-events';

type AddToCartStatus = 'idle' | 'pending' | 'added' | 'error';

const STATUS_MESSAGES: Record<AddToCartStatus, string> = {
	idle: '',
	pending: 'Adding to your cart…',
	added: 'Added to your cart.',
	error: 'That did not work. Try again.',
};

/**
 * `<add-to-cart>`: sends the add-to-cart form with `fetch`, so the page stays put and the header count updates.
 *
 * @remarks
 * The form inside is a plain `POST /cart/add`, which works without JavaScript. With it, the header count goes up
 * by one right away and then takes the server's total; a failed request takes the change back.
 */
@customElement('add-to-cart')
export class AddToCartElement extends RadiantElement {
	@state
	@bindTo<AddToCartStatus>([
		{ attr: 'data-status' },
		{ ref: 'submit', bool: 'disabled', map: (status) => status === 'pending' },
		{ ref: 'status', text: true, map: (status) => STATUS_MESSAGES[status] },
	])
	protected status: AddToCartStatus = 'idle';

	@ref() form!: HTMLFormElement | null;

	@onEvent({ ref: 'form', type: 'submit' })
	onSubmit(event: SubmitEvent): void {
		const form = this.form;
		if (!form) return;
		event.preventDefault();
		if (this.status !== 'pending') void this.send(form);
	}

	private async send(form: HTMLFormElement): Promise<void> {
		this.status = 'pending';
		dispatchCartChange({ delta: 1 });

		const response = await fetch(form.action, {
			method: 'POST',
			body: new FormData(form),
			headers: { accept: 'application/json' },
		}).catch(() => null);
		const summary = response?.ok ? ((await response.json().catch(() => null)) as CartSummary | null) : null;

		if (!summary) {
			dispatchCartChange({ delta: -1 });
			this.status = 'error';
			return;
		}
		dispatchCartChange({ count: summary.count });
		this.status = 'added';
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'add-to-cart': AddToCartElement;
	}
}
