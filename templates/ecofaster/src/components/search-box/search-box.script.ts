import { RadiantElement, bindTo, customElement, debounce, onEvent, ref, state } from '@ecopages/radiant';
import { MIN_SUGGESTION_QUERY, type SearchSuggestionsResponse } from '@/lib/catalog/search-suggestions';
import type { SearchSuggestionsPanel } from './search-suggestions.script';

const SUGGESTIONS_ENDPOINT = '/api/search';

function describePanel(panel: SearchSuggestionsPanel | null): string {
	if (!panel) return '';
	const count = panel.results.length;
	return count === 0
		? 'No suggestions.'
		: `${count} suggestion${count === 1 ? '' : 's'}. Press the down arrow to browse.`;
}

/**
 * `<search-box>`: a typeahead over the header search form.
 *
 * @remarks
 * The form is a plain `GET /search`, which works without JavaScript and when the visitor presses Enter. As the
 * visitor types, this host asks `/api/search` for the first matches and hands them to `<search-suggestions>`.
 * Answers are kept per query for the page's lifetime, and a newer keystroke aborts an older request.
 */
@customElement('search-box')
export class SearchBoxElement extends RadiantElement {
	@state
	@bindTo<SearchSuggestionsPanel | null>([
		{ ref: 'suggestions', prop: 'panel' },
		{ ref: 'announcer', text: true, map: describePanel },
	])
	protected panel: SearchSuggestionsPanel | null = null;

	@ref() input!: HTMLInputElement | null;
	@ref() suggestions!: HTMLElement | null;

	private readonly answers = new Map<string, SearchSuggestionsPanel>();
	private pending: AbortController | null = null;

	protected override onConnected(): void {
		if (this.input && document.activeElement === this.input) this.lookUp();
	}

	@onEvent({ ref: 'input', type: 'focusin' })
	onInputFocus(): void {
		this.lookUp();
	}

	@onEvent({ ref: 'input', type: 'input' })
	@debounce(120)
	onInput(): void {
		this.lookUp();
	}

	@onEvent({ ref: 'input', type: 'keydown' })
	onInputKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown' && this.focusSuggestion(0)) event.preventDefault();
		if (event.key === 'Escape') this.close();
	}

	@onEvent({ ref: 'suggestions', type: 'keydown' })
	onSuggestionsKeydown(event: KeyboardEvent): void {
		const links = this.suggestionLinks();
		const index = links.indexOf(document.activeElement as HTMLAnchorElement);
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const next = index + (event.key === 'ArrowDown' ? 1 : -1);
			if (next < 0) this.input?.focus();
			else this.focusSuggestion(Math.min(next, links.length - 1));
		}
		if (event.key === 'Escape') {
			this.input?.focus();
			this.close();
		}
	}

	@onEvent({ host: true, type: 'focusout' })
	onFocusOut(event: FocusEvent): void {
		if (!(event.relatedTarget instanceof Node) || !this.contains(event.relatedTarget)) this.close();
	}

	private close(): void {
		this.pending?.abort();
		this.panel = null;
	}

	private suggestionLinks(): HTMLAnchorElement[] {
		return Array.from(this.suggestions?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []);
	}

	private focusSuggestion(index: number): boolean {
		const link = this.suggestionLinks()[index];
		link?.focus();
		return Boolean(link);
	}

	private lookUp(): void {
		const query = this.input?.value.trim() ?? '';
		if (query.length < MIN_SUGGESTION_QUERY) {
			this.close();
			return;
		}
		const cached = this.answers.get(query);
		if (cached) {
			this.pending?.abort();
			this.panel = cached;
			return;
		}
		void this.fetchSuggestions(query);
	}

	private async fetchSuggestions(query: string): Promise<void> {
		this.pending?.abort();
		const controller = new AbortController();
		this.pending = controller;
		const url = new URL(SUGGESTIONS_ENDPOINT, window.location.origin);
		url.searchParams.set('q', query);

		const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } }).catch(
			() => null,
		);
		if (!response?.ok || controller.signal.aborted) return;
		const body = (await response.json().catch(() => null)) as SearchSuggestionsResponse | null;
		if (!body) return;
		const panel: SearchSuggestionsPanel = { query, results: body.results };
		this.answers.set(query, panel);
		if (!controller.signal.aborted) this.panel = panel;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'search-box': SearchBoxElement;
	}
}
