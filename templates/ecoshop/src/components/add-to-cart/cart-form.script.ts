import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, bindTo, customElement, onEvent, prop, query, state } from '@ecopages/radiant';
import '@ecopages/radiant-ui/radio-group';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import { toast } from '@ecopages/radiant-ui/toast';
import { callAgentTool, describeCartTotals } from '../../lib/agents/agent-tool-client';
import type { StoreToolResult } from '../../lib/agents/agent-tool-types';
import {
	type ToolInput,
	addToCartTool,
	agentToolConfig,
	showVariantTool,
} from '../../lib/agents/store-tool-definitions';
import type { CartTotals } from '../../lib/cart/cart-events';
import { productHandleFromPath } from '../../lib/store-urls';

type CartFormProps = {
	/** Toast title after a successful add. */
	success?: string;
};

/**
 * The product form's host: it adds to the cart in place for the shopper, and offers the same `add` and variant
 * selection to an in-browser agent as the WebMCP tools `add_to_cart` and `show_variant` while the form is on the
 * page.
 *
 * @remarks
 * The form inside is a complete, working form, so it posts and redirects normally before this script loads or
 * when JavaScript is off. Once the host has sent a change it never posts it again: a failed `fetch` may still have
 * reached the server, so every failure is reported in place and the shopper decides whether to retry. The button and
 * the agent call the same `add`, which runs through `/api/agent-tools`: the server validates the input and checks
 * that the variant belongs to this product, and the method returns only after the header count and the toast show
 * the change. `selectVariant` is the one place a variant gets selected, whether the shopper's link or the agent asks
 * for it. Radiant registers the tools while the host is connected, so a client navigation that removes the form
 * unregisters them.
 */
@customElement('cart-form')
export class CartForm extends RadiantElement {
	@prop({ type: String, defaultValue: 'Added to your cart' })
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

	@query('rui-radio-group')
	private variantPicker!: (HTMLElement & { value: string }) | null;

	protected override onConnected(): void {
		const variant = new URLSearchParams(location.search).get('variant');
		if (variant) this.selectVariant(variant);
	}

	/**
	 * Selects a variant in the picker, as a `?variant=` link and the `show_variant` tool ask.
	 *
	 * @returns Whether the picker now shows the variant. A sold out variant, an unknown one and a product without a
	 * picker leave it as it was.
	 */
	selectVariant(variant: string): boolean {
		const picker = this.variantPicker;
		const radio = picker?.querySelector<HTMLInputElement>(`input[type="radio"][value="${CSS.escape(variant)}"]`);
		if (!picker || !radio || radio.disabled) return false;
		picker.value = variant;
		return true;
	}

	/**
	 * Adds a variant of this product to the cart, for the add button and for the agent's `add_to_cart`.
	 *
	 * @remarks
	 * One addition at a time: a call while another is on its way is refused, so the shopper's click and an agent never
	 * stack two requests. A refusal or a failure comes back as a tool result with `isError` and shows in the form's
	 * status line; nothing is posted again.
	 */
	@agentTool(agentToolConfig(addToCartTool))
	async add(input: ToolInput<typeof addToCartTool>, options?: AgentToolExecuteOptions): Promise<StoreToolResult> {
		if (this.pending) return this.refuse('Another addition to the cart is still on its way.');
		this.pending = true;
		this.status = '';
		let result: StoreToolResult;
		try {
			result = await callAgentTool(addToCartTool.name, input, options?.signal, {
				onCartChange: (totals) => this.announce(this.success, totals),
			});
		} catch {
			this.pending = false;
			return this.refuse('The store could not be reached. Check your cart before trying again.');
		}
		this.pending = false;
		if (result.isError) {
			this.status = result.content[0]?.text.replace(/^Error: /u, '') ?? 'The cart could not be updated.';
		}
		return result;
	}

	/**
	 * Selects a variant of this product for the agent's `show_variant`, or opens the product page it names.
	 *
	 * @remarks
	 * The server resolves the variant. One of this page's product is selected in place, so the page the agent sees
	 * shows it without a navigation; another product's page opens through the router.
	 */
	@agentTool(agentToolConfig(showVariantTool))
	showVariant(input: ToolInput<typeof showVariantTool>, { signal }: AgentToolExecuteOptions) {
		return callAgentTool(showVariantTool.name, input, signal, { showsPage: (href) => this.showsPage(href) });
	}

	private showsPage(href: string): boolean {
		const target = new URL(href, location.href);
		if (productHandleFromPath(target.pathname) !== productHandleFromPath(location.pathname)) return false;
		const variant = target.searchParams.get('variant');
		if (variant) this.selectVariant(variant);
		return true;
	}

	private refuse(message: string): StoreToolResult {
		this.status = message;
		return {
			content: [{ type: 'text', text: `Error: ${message}` }],
			structuredContent: { error: message },
			isError: true,
		};
	}

	private announce(title: string, totals: CartTotals): void {
		this.status = '';
		toast.success(title, { description: describeCartTotals(totals) });
	}

	@onEvent({ selector: 'form', type: 'submit' })
	onSubmit(event: SubmitEvent) {
		const form = event.target;
		if (!(form instanceof HTMLFormElement)) return;
		event.preventDefault();
		const data = new FormData(form);
		const variantId = data.getAll('variantId').at(-1);
		void this.add({
			item: { id: typeof variantId === 'string' ? variantId : '' },
			quantity: Number(data.get('quantity')),
		});
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'cart-form': JsxCustomElementAttributes<CartForm, CartFormProps>;
	}
}
