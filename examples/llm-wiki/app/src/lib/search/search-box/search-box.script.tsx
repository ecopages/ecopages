import { RadiantElement, customElement, debounce, onEvent, prop, query, state } from '@ecopages/radiant';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiDialog, RuiDialogClose } from '@ecopages/radiant-ui/dialog';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { RuiListbox, RuiListboxOption } from '@ecopages/radiant-ui/listbox';
import { cx } from '@/lib/cx';
import { createSearchIndex, tokenize, type SearchDocument, type SearchResult } from '../engine';

const DEBOUNCE_MS = 250;
const PAGE_SIZE = 10;
const RECENT_STORAGE_KEY = 'llm-wiki-search-recent';
const MAX_RECENT = 5;

type WikiSearchDocument = SearchDocument & { category: string };
type SearchIndex = ReturnType<typeof createSearchIndex<WikiSearchDocument>>;

type RecentSearch = {
	title: string;
	category: string;
	url: string;
};

type SearchPanel = {
	loading: boolean;
	hasSearched: boolean;
	highlightQuery: string;
	results: SearchResult<WikiSearchDocument>[];
	page: number;
	totalPages: number;
};

export type SearchBoxElementProps = {
	indexUrl?: string;
	placeholder?: string;
	label?: string;
};

type SearchBoxBindings = SearchBoxElementProps & {
	dialogOpen: boolean;
	panel: SearchPanel;
	recent: RecentSearch[];
};

type ResultGroup = {
	label: string | null;
	results: SearchResult<WikiSearchDocument>[];
};

const EMPTY_PANEL: SearchPanel = {
	loading: false,
	hasSearched: false,
	highlightQuery: '',
	results: [],
	page: 1,
	totalPages: 0,
};

function formatCategory(category: string): string {
	return category ? category.charAt(0).toUpperCase() + category.slice(1) : '';
}

function isRecentSearch(value: unknown): value is RecentSearch {
	if (!value || typeof value !== 'object') return false;
	const entry = value as Record<string, unknown>;
	return typeof entry.title === 'string' && typeof entry.category === 'string' && typeof entry.url === 'string';
}

function readRecentSearches(): RecentSearch[] {
	try {
		const raw = localStorage.getItem(RECENT_STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isRecentSearch).slice(0, MAX_RECENT);
	} catch {
		return [];
	}
}

/** Persists recent visits; swallows quota / private-mode failures. */
function writeRecentSearches(recent: RecentSearch[]): void {
	try {
		localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent));
	} catch {}
}

function upsertRecent(recent: RecentSearch[], entry: RecentSearch): RecentSearch[] {
	return [entry, ...recent.filter((item) => item.url !== entry.url)].slice(0, MAX_RECENT);
}

function isIdleEmpty(panel: SearchPanel): boolean {
	return !panel.loading && !panel.hasSearched && panel.results.length === 0;
}

function groupByCategory(results: SearchResult<WikiSearchDocument>[]): ResultGroup[] {
	const groups: ResultGroup[] = [];
	const byLabel = new Map<string | null, SearchResult<WikiSearchDocument>[]>();

	for (const result of results) {
		const category = result.category;
		const label = category ? formatCategory(category) : null;
		let bucket = byLabel.get(label);
		if (!bucket) {
			bucket = [];
			byLabel.set(label, bucket);
			groups.push({ label, results: bucket });
		}
		bucket.push(result);
	}

	return groups;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Wraps whole-word occurrences of any query token in `<mark>`, matching the engine's exact-token semantics. */
function highlight(text: string, tokens: string[]): JsxRenderable {
	if (tokens.length === 0) {
		return text;
	}

	const pattern = [...tokens]
		.sort((a, b) => b.length - a.length)
		.map(escapeRegExp)
		.join('|');
	const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, 'giu');
	const parts = text.split(regex);

	return <>{parts.map((part, index) => (index % 2 === 1 ? <mark>{part}</mark> : part))}</>;
}

export function SearchIcon() {
	return (
		<svg class="search-box__icon" aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em">
			<path
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
			/>
		</svg>
	);
}

/** Header trigger; also SSR'd from `SearchBox` so the control is visible before hydration. */
export function SearchTrigger({ label }: { label: string }) {
	return (
		<RuiButton
			type="button"
			variant="outline"
			size="sm"
			class="search-box__trigger"
			aria-haspopup="dialog"
			aria-label={label}
		>
			<SearchIcon />
			<kbd class="search-box__shortcut">⌘K</kbd>
		</RuiButton>
	);
}

/**
 * `<radiant-search-box>` — a ⌘K command-palette search box. Loads documents from
 * `indexUrl` (a JSON array of `SearchDocument`s, e.g. `/search-index.json`) and
 * searches client-side so it works under static `preview` as well as `dev`/`start`.
 *
 * @remarks
 * Open/close uses a plain `dialogOpen` read so the host rerenders and mounts
 * `rui-dialog` with `open` already true (updating `open` on a mounted dialog is
 * a no-op). Results use a hoisted `this.$.panel.map` binding so the uncontrolled
 * search field is not remounted on each keystroke.
 *
 * @remarks
 * Empty open states: with no history the dialog stays a minimal pill (input only);
 * after visits, idle open shows recent pages from `localStorage`.
 */
@customElement('radiant-search-box')
export class RadiantSearchBox extends RadiantElement<SearchBoxBindings> {
	@prop({
		type: String,
		attribute: 'index-url',
		reflect: true,
		defaultValue: '/search-index.json',
	})
	declare indexUrl: string;
	@prop({ type: String, reflect: true, defaultValue: 'Search…' })
	declare placeholder: string;
	@prop({ type: String, reflect: true, defaultValue: 'Search' })
	declare label: string;

	@state dialogOpen = false;
	@state panel: SearchPanel = { ...EMPTY_PANEL };
	@state recent: RecentSearch[] = [];

	@query({ selector: 'input[data-rui-control]' })
	declare private searchInput: HTMLInputElement | null;

	private indexPromise?: Promise<SearchIndex>;

	/**
	 * Hoisted once — never call `.map` inside `render()`.
	 * @remarks Reads `this.recent` when `panel` changes; recent is refreshed before open.
	 */
	private readonly panelChrome = this.$.panel.map((panel) => this.renderChrome(panel, this.recent));

	private readQuery(): string {
		return this.searchInput?.value ?? '';
	}

	private rememberVisit(entry: RecentSearch): void {
		this.recent = upsertRecent(this.recent, entry);
		writeRecentSearches(this.recent);
	}

	private resolveVisit(url: string): RecentSearch | null {
		const fromResults = this.panel.results.find((result) => result.url === url);
		if (fromResults) {
			return {
				title: fromResults.title,
				category: fromResults.category,
				url: fromResults.url,
			};
		}
		return this.recent.find((entry) => entry.url === url) ?? null;
	}

	private openResult(url: string): void {
		const visit = this.resolveVisit(url);
		if (visit) {
			this.rememberVisit(visit);
		}
		window.location.href = url;
	}

	private readonly openDialog = () => {
		this.recent = readRecentSearches();
		this.dialogOpen = true;
	};

	@onEvent({ selector: '.search-box__trigger', type: 'click' })
	onTriggerClick(): void {
		this.openDialog();
	}

	@onEvent({ window: true, type: 'keydown' })
	onWindowKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			this.openDialog();
		}
	}

	@onEvent({ selector: 'rui-dialog', type: 'rui-close' })
	onDialogClose(): void {
		this.dialogOpen = false;
		this.resetSearch();
	}

	@onEvent({ selector: '[role="option"]', type: 'click' })
	onResultClick(event: MouseEvent): void {
		const url = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]')?.dataset.value;
		if (url) {
			this.openResult(url);
		}
	}

	@onEvent({ selector: '[role="option"]', type: 'keydown' })
	onResultKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		const url = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]')?.dataset.value;
		if (url) {
			this.openResult(url);
		}
	}

	private readonly handleInput = () => {
		this.scheduleSearch();
	};

	@debounce(DEBOUNCE_MS)
	private scheduleSearch(): void {
		if (!this.isConnected) return;
		void this.runSearch(1);
	}

	/**
	 * `RuiInput`'s prop type only declares `on:input`/`on:change`/`on:blur` — no
	 * `on:keydown` passthrough — so this listens via delegation instead of a JSX prop.
	 */
	@onEvent({ selector: 'input[data-rui-control]', type: 'keydown' })
	onInputKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			const firstOption = this.querySelector<HTMLElement>('[role="option"]');
			if (firstOption) {
				event.preventDefault();
				firstOption.focus();
			}
			return;
		}
		if (event.key === 'Enter') {
			const top = this.panel.results[0] ?? (isIdleEmpty(this.panel) ? this.recent[0] : undefined);
			if (top) {
				event.preventDefault();
				this.openResult(top.url);
			}
		}
	}

	private readonly handlePrev = () => {
		if (this.panel.page <= 1) return;
		void this.runSearch(this.panel.page - 1);
	};

	private readonly handleNext = () => {
		if (this.panel.page >= this.panel.totalPages) return;
		void this.runSearch(this.panel.page + 1);
	};

	private resetSearch(): void {
		if (this.searchInput) {
			this.searchInput.value = '';
		}
		this.panel = { ...EMPTY_PANEL };
	}

	private loadIndex(): Promise<SearchIndex> {
		if (!this.indexPromise) {
			this.indexPromise = fetch(this.indexUrl)
				.then(async (response) => {
					if (!response.ok) {
						throw new Error(`Failed to load search index (${response.status})`);
					}
					return response.json() as Promise<WikiSearchDocument[]>;
				})
				.then((documents) => createSearchIndex(documents));
		}
		return this.indexPromise;
	}

	private async runSearch(page: number): Promise<void> {
		const query = this.readQuery().trim();
		if (!query) {
			this.panel = { ...EMPTY_PANEL };
			return;
		}

		this.panel = {
			...this.panel,
			loading: true,
			page,
		};

		try {
			const index = await this.loadIndex();
			if (!this.isConnected || this.readQuery().trim() !== query) {
				return;
			}
			const data = index.search(query, { page, limit: PAGE_SIZE });
			this.panel = {
				loading: false,
				hasSearched: true,
				highlightQuery: query,
				results: data.results,
				page: data.page,
				totalPages: data.totalPages,
			};
		} catch {
			if (this.isConnected && this.readQuery().trim() === query) {
				this.panel = {
					loading: false,
					hasSearched: true,
					highlightQuery: query,
					results: [],
					page: 1,
					totalPages: 0,
				};
			}
		}
	}

	private renderRecent(recent: RecentSearch[]): JsxRenderable {
		if (recent.length === 0) return null;

		return (
			<RuiListbox label="Recent searches" bordered={false} class="search-box__results">
				<div class="search-box__recent-heading">Recent searches</div>
				{recent.map((entry) => (
					<RuiListboxOption value={entry.url} label={entry.title} class="search-box__option">
						<span class="search-box__result-title">{entry.title}</span>
						{entry.category ? (
							<span class="search-box__result-snippet">{formatCategory(entry.category)}</span>
						) : null}
					</RuiListboxOption>
				))}
			</RuiListbox>
		);
	}

	private renderPanel(panel: SearchPanel, recent: RecentSearch[]): JsxRenderable {
		const tokens = tokenize(panel.highlightQuery);
		const groups = groupByCategory(panel.results);

		return (
			<>
				{panel.loading ? <p class="search-box__status">Searching…</p> : null}
				{!panel.loading && panel.hasSearched && panel.results.length === 0 ? (
					<p class="search-box__status">No results for &quot;{panel.highlightQuery}&quot;</p>
				) : null}
				{isIdleEmpty(panel) ? this.renderRecent(recent) : null}
				{!panel.loading && panel.results.length > 0 ? (
					<RuiListbox label="Search results" bordered={false} class="search-box__results">
						{groups.map((group) => (
							<>
								{group.label ? <div class="search-box__group-heading">{group.label}</div> : null}
								{group.results.map((result) => (
									<RuiListboxOption
										value={result.url}
										label={result.title}
										class="search-box__option"
									>
										<span class="search-box__result-title">{highlight(result.title, tokens)}</span>
										<span class="search-box__result-snippet">
											{highlight(result.snippet, tokens)}
										</span>
									</RuiListboxOption>
								))}
							</>
						))}
					</RuiListbox>
				) : null}
				{!panel.loading && panel.totalPages > 1 ? (
					<div class="search-box__pagination">
						<RuiButton
							type="button"
							variant="ghost"
							size="sm"
							disabled={panel.page <= 1}
							on:click={this.handlePrev}
						>
							Previous
						</RuiButton>
						<span class="search-box__page-indicator">
							Page {panel.page} of {panel.totalPages}
						</span>
						<RuiButton
							type="button"
							variant="ghost"
							size="sm"
							disabled={panel.page >= panel.totalPages}
							on:click={this.handleNext}
						>
							Next
						</RuiButton>
					</div>
				) : null}
			</>
		);
	}

	private renderChrome(panel: SearchPanel, recent: RecentSearch[]): JsxRenderable {
		const minimal = isIdleEmpty(panel) && recent.length === 0;

		return (
			<>
				<div class={cx('search-box__body', minimal && 'search-box__body--minimal')}>
					{minimal ? null : this.renderPanel(panel, recent)}
				</div>
				{minimal ? null : (
					<div class="search-box__hints">
						<span>
							<kbd>↑</kbd>
							<kbd>↓</kbd> Navigate
						</span>
						<span>
							<kbd>↵</kbd> Select
						</span>
						<span>
							<kbd>Esc</kbd> Close
						</span>
					</div>
				)}
			</>
		);
	}

	override render() {
		return (
			<>
				<SearchTrigger label={this.label} />
				{this.dialogOpen ? (
					<RuiDialog open label={this.label} class="search-box__dialog">
						<div class="search-box__input-row">
							<SearchIcon />
							<RuiInput
								type="search"
								placeholder={this.placeholder}
								aria-label={this.label}
								on:input={this.handleInput}
							/>
							<RuiDialogClose slot="" aria-label="Close search" class="search-box__close" />
						</div>
						{this.panelChrome}
					</RuiDialog>
				) : null}
			</>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'radiant-search-box': JsxCustomElementAttributes<RadiantSearchBox, SearchBoxElementProps>;
	}
}
