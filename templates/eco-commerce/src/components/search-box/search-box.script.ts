import '@ecopages/radiant-ui/combobox';
import '@ecopages/radiant-ui/listbox';
import { RadiantElement, bindTo, customElement, debounce, onEvent, query, ref, state } from '@ecopages/radiant';
import { navigate } from '@/lib/browser/navigation';
import type { ProductJson, ProductListJson } from '@/lib/storefront/json';
import { listingUrl, parseListingQuery } from '@/lib/storefront/listing-query';

/** Shortest term looked up; the server answers shorter ones with nothing. */
const MIN_TERM_LENGTH = 2;
const SUGGESTION_COUNT = 6;

/**
 * `<search-box>`: fills the `RuiCombobox` with the first matches as the visitor types.
 *
 * @remarks
 * Picking an option opens that product; Enter without a picked option opens the search page. Both are client
 * navigations. Answers are kept per term for the page's lifetime, and a newer keystroke aborts an older request.
 */
@customElement('search-box')
export class SearchBoxElement extends RadiantElement {
	@state
	@bindTo<ProductJson[]>({ selector: 'search-suggestions', prop: 'results' })
	protected results: ProductJson[] = [];

	@query('input[name="q"]') input!: HTMLInputElement | null;
	@ref() form!: HTMLFormElement | null;

	private readonly answers = new Map<string, ProductJson[]>();
	private pending: AbortController | null = null;

	protected override onConnected(): void {
		if (this.input && document.activeElement === this.input) this.lookUp();
	}

	@onEvent({ selector: 'input[name="q"]', type: 'input' })
	@debounce(120)
	onInput(): void {
		this.lookUp();
	}

	@onEvent({ ref: 'combobox', type: 'change' })
	onPick(event: Event): void {
		const combobox = this.querySelector<HTMLElement & { value?: string[] }>('rui-combobox');
		const url = combobox?.value?.[0];
		if (event.target === combobox && url) void navigate(url);
	}

	@onEvent({ ref: 'form', type: 'submit' })
	onSubmit(event: SubmitEvent): void {
		event.preventDefault();
		const term = this.input?.value.trim() ?? '';
		void navigate(listingUrl(parseListingQuery({ q: term })));
	}

	private lookUp(): void {
		const term = this.input?.value.trim() ?? '';
		this.pending?.abort();
		if (term.length < MIN_TERM_LENGTH) {
			this.results = [];
			return;
		}
		const cached = this.answers.get(term);
		if (cached) this.results = cached;
		else void this.fetchSuggestions(term);
	}

	private async fetchSuggestions(term: string): Promise<void> {
		const controller = new AbortController();
		this.pending = controller;
		const params = new URLSearchParams({ q: term, pageSize: String(SUGGESTION_COUNT) });
		const response = await fetch(`/api/products?${params}`, {
			signal: controller.signal,
			headers: { accept: 'application/json' },
		}).catch(() => null);
		if (!response?.ok || controller.signal.aborted) return;
		const body = (await response.json().catch(() => null)) as ProductListJson | null;
		if (!body || controller.signal.aborted) return;
		this.answers.set(term, body.items);
		this.results = body.items;
		requestAnimationFrame(() => this.reopenWithResults());
	}

	/**
	 * Lets the combobox open on options that arrived after the keystroke.
	 *
	 * @remarks
	 * `RuiCombobox` decides whether to open when the input fires `input`, and at that moment the answer has not
	 * arrived. It offers no method to open the popup, so the input event is sent again once the options render;
	 * this host's own listener then finds the answer cached and sends no request.
	 */
	private reopenWithResults(): void {
		if (this.input && document.activeElement === this.input && this.results.length > 0) {
			this.input.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'search-box': SearchBoxElement;
	}
}
