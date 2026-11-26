import '@ecopages/radiant-ui/number-field';
import '@ecopages/radiant-ui/radio-group';
import { RadiantElement, bindTo, customElement, onEvent, query, ref, state } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import { toast } from '@ecopages/radiant-ui/toast';
import { dispatchCartChange } from '@/lib/storefront/cart-events';
import type { CartJson } from '@/lib/storefront/json';
import { isStoreError, postCartChange, type StoreError } from '@/lib/browser/store-api';
import { readToolInput } from '@/lib/webmcp/catalog-tools';
import { addToCartTool, selectVariantTool } from '@/lib/webmcp/definitions';

/**
 * `<add-to-cart>`: sends the buy form with `fetch`, so the page stays put and the header count updates.
 *
 * @remarks
 * The header count moves by the added quantity at once and then takes the server's total; a refused or failed
 * request takes the change back. A toast reports the outcome. The agent tools reach the same `add` and
 * `selectVariant` methods the form uses, and return only once the page shows the change.
 */
@customElement('add-to-cart')
export class AddToCartElement extends RadiantElement {
	@state
	@bindTo<boolean>([
		{ ref: 'submit', bool: 'disabled' },
		{ ref: 'spinner', bool: 'hidden', invert: true },
	])
	protected pending = false;

	@ref() form!: HTMLFormElement | null;

	@query('input[name="quantity"]') quantity!: HTMLInputElement | null;

	/**
	 * @remarks
	 * `data-enhanced` marks the moment the form is sent with `fetch`; until then a click submits the plain form.
	 * Styles and tests can key off it.
	 */
	protected override onConnected(): void {
		this.toggleAttribute('data-enhanced', true);
	}

	private variantInputs(): HTMLInputElement[] {
		return Array.from(this.querySelectorAll<HTMLInputElement>('input[name="variantId"]'));
	}

	private selectedVariant(): HTMLInputElement | undefined {
		return this.variantInputs().find((input) => input.checked) ?? this.variantInputs()[0];
	}

	private findVariant(value: string): HTMLInputElement | undefined {
		const wanted = value.trim().toLowerCase();
		return this.variantInputs().find(
			(input) => input.value === value || input.closest('label')?.textContent?.trim().toLowerCase() === wanted,
		);
	}

	@onEvent({ ref: 'form', type: 'submit' })
	onSubmit(event: SubmitEvent): void {
		event.preventDefault();
		const variant = this.selectedVariant();
		const quantity = Number(this.quantity?.value) || 1;
		if (variant) void this.add(variant.value, quantity);
	}

	/**
	 * Adds `quantity` units of a variant, keeping the header and a toast in step.
	 *
	 * @remarks
	 * One add at a time, from the form or an agent: a second call while one is in flight is refused, so the
	 * header's optimistic count never stacks two guesses.
	 */
	async add(variantId: string, quantity: number, signal?: AbortSignal): Promise<CartJson | StoreError> {
		if (this.pending) return { error: 'Another addition to the cart is still on its way.' };
		this.pending = true;
		dispatchCartChange({ delta: quantity });
		const result = await postCartChange('/cart/add', { variantId, quantity }, { fetch, signal });
		this.pending = false;
		if (isStoreError(result)) {
			dispatchCartChange({ delta: -quantity });
			toast.error(result.error);
			return result;
		}
		dispatchCartChange({ cart: result });
		toast.success(quantity === 1 ? 'Added to your cart.' : `Added ${quantity} to your cart.`);
		return result;
	}

	/** Checks a finish radio, as a click on it would. */
	selectVariant(value: string): { variantId: string; title: string } | StoreError {
		const input = this.findVariant(value);
		if (!input) return { error: `variant: no finish named "${value}" on this product` };
		input.click();
		return { variantId: input.value, title: input.closest('label')?.textContent?.trim() ?? input.value };
	}

	@agentTool(addToCartTool)
	addToCartTool(input: unknown, { signal }: AgentToolExecuteOptions) {
		const values = readToolInput(addToCartTool, input);
		if (isStoreError(values)) return values;
		const variant = values.variant === undefined ? this.selectedVariant() : this.findVariant(values.variant);
		if (!variant) return { error: `variant: no finish named "${values.variant}" on this product` };
		return this.add(variant.value, values.quantity ?? 1, signal);
	}

	@agentTool(selectVariantTool)
	selectVariantTool(input: unknown) {
		const values = readToolInput(selectVariantTool, input);
		return isStoreError(values) ? values : this.selectVariant(values.variant);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'add-to-cart': AddToCartElement;
	}
}
