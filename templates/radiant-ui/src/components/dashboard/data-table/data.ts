export type Milk = 'Cow' | 'Sheep' | 'Goat' | 'Mixed';
export type Texture = 'Soft' | 'Semi-hard' | 'Hard';
export type Origin = 'France' | 'Italy' | 'Spain' | 'Switzerland' | 'Netherlands' | 'Greece' | 'United Kingdom';

export type Item = {
	id: string;
	name: string;
	milk: Milk;
	texture: Texture;
	origin: Origin;
};

export type ItemDraft = Omit<Item, 'id'>;
export type SortColumn = Exclude<keyof Item, 'id'>;

export type TableFilters = {
	search?: string;
	milk?: Milk | '';
	texture?: Texture | '';
	origin?: Origin | '';
	sortColumn?: SortColumn;
	sortDirection?: 'ascending' | 'descending';
	page?: number;
	pageSize?: number;
};

export type ResolvedTableFilters = Required<TableFilters>;

export type QueryPage = {
	items: Item[];
	page: number;
	pageSize: number;
	total: number;
};

export const defaultTableFilters: ResolvedTableFilters = {
	search: '',
	milk: '',
	texture: '',
	origin: '',
	sortColumn: 'name',
	sortDirection: 'ascending',
	page: 1,
	pageSize: 5,
};

export const initialItems: Item[] = [
	{ id: 'appenzeller', name: 'Appenzeller', milk: 'Cow', texture: 'Semi-hard', origin: 'Switzerland' },
	{ id: 'beaufort', name: 'Beaufort', milk: 'Cow', texture: 'Hard', origin: 'France' },
	{ id: 'brie', name: 'Brie', milk: 'Cow', texture: 'Soft', origin: 'France' },
	{ id: 'burrata', name: 'Burrata', milk: 'Cow', texture: 'Soft', origin: 'Italy' },
	{ id: 'camembert', name: 'Camembert', milk: 'Cow', texture: 'Soft', origin: 'France' },
	{ id: 'cheddar', name: 'Cheddar', milk: 'Cow', texture: 'Hard', origin: 'United Kingdom' },
	{ id: 'comte', name: 'Comté', milk: 'Cow', texture: 'Hard', origin: 'France' },
	{ id: 'edam', name: 'Edam', milk: 'Cow', texture: 'Semi-hard', origin: 'Netherlands' },
	{ id: 'emmental', name: 'Emmental', milk: 'Cow', texture: 'Hard', origin: 'Switzerland' },
	{ id: 'feta', name: 'Feta', milk: 'Sheep', texture: 'Soft', origin: 'Greece' },
	{ id: 'gorgonzola', name: 'Gorgonzola', milk: 'Cow', texture: 'Semi-hard', origin: 'Italy' },
	{ id: 'gouda', name: 'Gouda', milk: 'Cow', texture: 'Semi-hard', origin: 'Netherlands' },
	{ id: 'gruyere', name: 'Gruyère', milk: 'Cow', texture: 'Hard', origin: 'Switzerland' },
	{ id: 'halloumi', name: 'Halloumi', milk: 'Mixed', texture: 'Semi-hard', origin: 'Greece' },
	{ id: 'idiazabal', name: 'Idiazábal', milk: 'Sheep', texture: 'Hard', origin: 'Spain' },
	{ id: 'mahon', name: 'Mahón', milk: 'Cow', texture: 'Semi-hard', origin: 'Spain' },
	{ id: 'manchego', name: 'Manchego', milk: 'Sheep', texture: 'Semi-hard', origin: 'Spain' },
	{ id: 'mimolette', name: 'Mimolette', milk: 'Cow', texture: 'Hard', origin: 'France' },
	{ id: 'mozzarella', name: 'Mozzarella', milk: 'Cow', texture: 'Soft', origin: 'Italy' },
	{ id: 'parmigiano', name: 'Parmigiano Reggiano', milk: 'Cow', texture: 'Hard', origin: 'Italy' },
	{ id: 'pecorino', name: 'Pecorino Romano', milk: 'Sheep', texture: 'Hard', origin: 'Italy' },
	{ id: 'raclette', name: 'Raclette', milk: 'Cow', texture: 'Semi-hard', origin: 'Switzerland' },
	{ id: 'reblochon', name: 'Reblochon', milk: 'Cow', texture: 'Soft', origin: 'France' },
	{ id: 'roquefort', name: 'Roquefort', milk: 'Sheep', texture: 'Semi-hard', origin: 'France' },
	{ id: 'stilton', name: 'Stilton', milk: 'Cow', texture: 'Semi-hard', origin: 'United Kingdom' },
	{ id: 'taleggio', name: 'Taleggio', milk: 'Cow', texture: 'Soft', origin: 'Italy' },
];

export const pageSizeOptions = [
	{ value: '5', label: '5' },
	{ value: '10', label: '10' },
	{ value: '20', label: '20' },
];

export const milkOptions = [
	{ value: 'Cow', label: 'Cow' },
	{ value: 'Sheep', label: 'Sheep' },
	{ value: 'Goat', label: 'Goat' },
	{ value: 'Mixed', label: 'Mixed' },
];

export const textureOptions = [
	{ value: 'Soft', label: 'Soft' },
	{ value: 'Semi-hard', label: 'Semi-hard' },
	{ value: 'Hard', label: 'Hard' },
];

export const originOptions = [
	{ value: 'France', label: 'France' },
	{ value: 'Italy', label: 'Italy' },
	{ value: 'Spain', label: 'Spain' },
	{ value: 'Switzerland', label: 'Switzerland' },
	{ value: 'Netherlands', label: 'Netherlands' },
	{ value: 'Greece', label: 'Greece' },
	{ value: 'United Kingdom', label: 'United Kingdom' },
];

export function resolveFilters(filters: TableFilters | null | undefined): ResolvedTableFilters {
	const next = filters ?? {};
	return {
		search: next.search ?? defaultTableFilters.search,
		milk: next.milk ?? defaultTableFilters.milk,
		texture: next.texture ?? defaultTableFilters.texture,
		origin: next.origin ?? defaultTableFilters.origin,
		sortColumn: next.sortColumn ?? defaultTableFilters.sortColumn,
		page: Math.max(1, Math.floor(next.page ?? defaultTableFilters.page)),
		pageSize: Math.max(1, Math.floor(next.pageSize ?? defaultTableFilters.pageSize)),
		sortDirection: next.sortDirection ?? defaultTableFilters.sortDirection,
	};
}

export function cloneItems(): Item[] {
	return structuredClone(initialItems);
}

const validMilkOptions = new Set<ItemDraft['milk']>(['Cow', 'Sheep', 'Goat', 'Mixed']);
const validTextureOptions = new Set<ItemDraft['texture']>(['Soft', 'Semi-hard', 'Hard']);
const validOriginOptions = new Set<ItemDraft['origin']>([
	'France',
	'Italy',
	'Spain',
	'Switzerland',
	'Netherlands',
	'Greece',
	'United Kingdom',
]);

export function normalizeDraft(value: unknown): ItemDraft | null {
	if (!isRecord(value)) {
		return null;
	}
	const name = typeof value.name === 'string' ? value.name.trim() : '';
	if (
		!name ||
		!validMilkOptions.has(value.milk as ItemDraft['milk']) ||
		!validTextureOptions.has(value.texture as ItemDraft['texture']) ||
		!validOriginOptions.has(value.origin as ItemDraft['origin'])
	) {
		return null;
	}
	return {
		name,
		milk: value.milk as ItemDraft['milk'],
		texture: value.texture as ItemDraft['texture'],
		origin: value.origin as ItemDraft['origin'],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Session-scoped inventory. Survives table refreshes; resets on full reload. */
let inventory = cloneItems();

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function createItemId(name: string, count: number): string {
	const slug = name.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
	return `${slug}-${count}`;
}

/**
 * Filter, sort, and paginate the in-memory inventory.
 *
 * @remarks Matches the Storybook MSW `/api/items` handler so the table host
 * can run without a network. The delay is what makes the refresh spinner visible.
 */
export async function queryItems(filters: ResolvedTableFilters, latency = 40): Promise<QueryPage> {
	await wait(latency);
	const search = filters.search.toLocaleLowerCase();
	const direction = filters.sortDirection === 'descending' ? -1 : 1;
	const matches = inventory.filter((item) => {
		return (
			(!search || item.name.toLocaleLowerCase().includes(search)) &&
			(!filters.milk || item.milk === filters.milk) &&
			(!filters.texture || item.texture === filters.texture) &&
			(!filters.origin || item.origin === filters.origin)
		);
	});
	matches.sort((left, right) => {
		const leftValue = left[filters.sortColumn] ?? '';
		const rightValue = right[filters.sortColumn] ?? '';
		return String(leftValue).localeCompare(String(rightValue)) * direction;
	});
	const pageCount = Math.max(1, Math.ceil(matches.length / filters.pageSize));
	const page = Math.min(filters.page, pageCount);
	const start = (page - 1) * filters.pageSize;
	return {
		items: matches.slice(start, start + filters.pageSize),
		page,
		pageSize: filters.pageSize,
		total: matches.length,
	};
}

export async function createItem(draft: ItemDraft, latency = 40): Promise<Item> {
	await wait(latency);
	const item = { id: createItemId(draft.name, inventory.length + 1), ...draft };
	inventory = [...inventory, item];
	return item;
}

export async function updateItem(id: string, draft: ItemDraft, latency = 40): Promise<Item | null> {
	await wait(latency);
	const index = inventory.findIndex((item) => item.id === id);
	if (index < 0) {
		return null;
	}
	const item = { id, ...draft };
	inventory = inventory.map((entry) => (entry.id === id ? item : entry));
	return item;
}

export async function removeItem(id: string, latency = 40): Promise<boolean> {
	await wait(latency);
	if (!inventory.some((item) => item.id === id)) {
		return false;
	}
	inventory = inventory.filter((item) => item.id !== id);
	return true;
}
