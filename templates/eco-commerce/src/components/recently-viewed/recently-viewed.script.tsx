import type { JSX_PROPS, JsxRenderable } from '@ecopages/jsx';
import { RadiantElement, customElement, prop, state } from '@ecopages/radiant';
import type { ProductJson } from '@/lib/storefront/json';

const STORAGE_KEY = 'store:recently-viewed';
const MAX_ENTRIES = 12;

export type RecentlyViewedProps = {
	/** The product on this page, as JSON; it is remembered and left out of the strip. */
	product?: string;
};

function isProduct(value: unknown): value is ProductJson {
	const entry = value as Partial<ProductJson> | null;
	return typeof entry?.handle === 'string' && typeof entry.url === 'string' && typeof entry.title === 'string';
}

function readEntries(): ProductJson[] {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
		return Array.isArray(parsed) ? parsed.filter(isProduct).slice(0, MAX_ENTRIES) : [];
	} catch {
		return [];
	}
}

/** Saves the list; a full or disabled storage only means the strip is not remembered. */
function writeEntries(entries: ProductJson[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch {}
}

/**
 * `<recently-viewed>`: remembers the products a visitor opened, in `localStorage`, and lists the others.
 *
 * @remarks
 * Nothing leaves the browser. The strip renders only once the element connects, so it is absent without
 * JavaScript and on a first visit.
 */
@customElement('recently-viewed')
export class RecentlyViewedElement extends RadiantElement {
	declare readonly [JSX_PROPS]?: RecentlyViewedProps;

	@prop({ type: String, defaultValue: '' }) product = '';
	@state protected entries: ProductJson[] = [];

	protected override onConnected(): void {
		let current: unknown = null;
		try {
			current = this.product ? JSON.parse(this.product) : null;
		} catch {}
		const stored = readEntries();
		if (isProduct(current)) {
			writeEntries([current, ...stored.filter((entry) => entry.handle !== current.handle)].slice(0, MAX_ENTRIES));
			this.entries = stored.filter((entry) => entry.handle !== current.handle);
		} else {
			this.entries = stored;
		}
	}

	override render(): JsxRenderable {
		if (this.entries.length === 0) return null;
		return (
			<section class="recently-viewed" aria-labelledby="recently-viewed-heading">
				<h2 id="recently-viewed-heading">Recently viewed</h2>
				<ul>
					{this.entries.map((entry) => (
						<li>
							<a href={entry.url}>
								<img
									src={entry.thumbnail}
									alt=""
									width={120}
									height={120}
									loading="lazy"
									decoding="async"
								/>
								<span>{entry.title}</span>
								<span class="recently-viewed__price">{entry.price}</span>
							</a>
						</li>
					))}
				</ul>
			</section>
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'recently-viewed': RecentlyViewedElement;
	}
}
