import { RadiantElement, bindTo, customElement, onEvent, ref, state } from '@ecopages/radiant';
import type { CartSummary } from '@/lib/cart/cart';
import { dispatchCartChange } from '@/lib/cart/cart-events';

type AddToCartStatus = 'idle' | 'pending' | 'added' | 'error';

const PENDING_MESSAGE = 'Adding to your cart…';
const ADDED_MESSAGE = 'Added to your cart.';
const FAILED_MESSAGE = 'That did not work. Try again.';

/** The JSON error a refused cart change carries, such as a full cart. */
type CartError = { error?: unknown };

async function readError(response: Response | null): Promise<string> {
	const body = (await response?.json().catch(() => null)) as CartError | null;
	return typeof body?.error === 'string' ? body.error : FAILED_MESSAGE;
}

/**
 * `<add-to-cart>`: sends the add-to-cart form with `fetch`, so the page stays put and the header count updates.
 *
 * @remarks
 * The form inside is a plain `POST /cart/add`, which works without JavaScript. With it, the header count goes up
 * by one right away and then takes the server's total; a refused or failed request takes the change back and
 * shows the server's reason, such as a full cart.
 */
@customElement('add-to-cart')
export class AddToCartElement extends RadiantElement {
	@state
	@bindTo<AddToCartStatus>([
		{ attr: 'data-status' },
		{ ref: 'submit', bool: 'disabled', map: (status) => status === 'pending' },
	])
	protected status: AddToCartStatus = 'idle';

	@state
	@bindTo<string>({ ref: 'status', text: true })
	protected message = '';

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
		this.message = PENDING_MESSAGE;
		dispatchCartChange({ delta: 1 });

		const response = await fetch(form.action, {
			method: 'POST',
			body: new FormData(form),
			headers: { accept: 'application/json' },
		}).catch(() => null);
		const summary = response?.ok ? ((await response.json().catch(() => null)) as CartSummary | null) : null;

		if (!summary) {
			dispatchCartChange({ delta: -1 });
			this.message = response?.ok ? FAILED_MESSAGE : await readError(response);
			this.status = 'error';
			return;
		}
		dispatchCartChange({ count: summary.count });
		this.message = ADDED_MESSAGE;
		this.status = 'added';
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'add-to-cart': AddToCartElement;
	}
}
