import '@ecopages/radiant-ui/combobox';
import '@ecopages/radiant-ui/listbox';
import { RadiantElement, bindTo, customElement, debounce, onEvent, query, ref, state } from '@ecopages/radiant';
import { navigate } from '@/lib/browser/navigation';
import { LIMITS } from '@/lib/limits';
import type { ProductJson, ProductListJson } from '@/lib/storefront/json';
import { listingUrl, parseListingQuery } from '@/lib/storefront/listing-query';
import { getJson, isStoreError } from '@/lib/browser/store-api';

const SUGGESTION_COUNT = 6;

/**
 * `<search-box>`: fills the `RuiCombobox` with the first matches as the visitor types.
 *
 * @remarks
 * Picking an option opens that product; Enter without a picked option opens the search page. Both are client
 * navigations. Answers are kept per term for the page's lifetime, and a newer keystroke aborts an older request.
 * The combobox opens by itself when the options arrive after the keystroke.
 *
 * The scripts load on the first pointer or focus on the search, so a visitor may have typed before they run: the
 * combobox keeps that text, and `onConnected` looks it up when the input has focus.
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
		if (term.length < LIMITS.minSearchTerm) {
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
		const body = await getJson<ProductListJson>(`/api/products?${params}`, { fetch, signal: controller.signal });
		if (isStoreError(body) || controller.signal.aborted) return;
		this.answers.set(term, body.items);
		this.results = body.items;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'search-box': SearchBoxElement;
	}
}
