import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiCheckbox } from '@ecopages/radiant-ui/checkbox';
import { RuiCheckboxGroup, RuiCheckboxGroupControl } from '@ecopages/radiant-ui/checkbox-group';
import { RuiChip } from '@ecopages/radiant-ui/chip';
import { RuiDisclosure } from '@ecopages/radiant-ui/disclosure';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { RadioChoices } from '@/components/radio-choices';
import { listingUrl, SORTS, type ListingFilters } from '@/lib/storefront/listing-query';
import './product-filters.css';

export type ProductFiltersProps = {
	filters: ListingFilters;
	facets: { materials: string[]; finishes: string[] };
};

/**
 * @remarks
 * Each checkbox carries `name` and `checked` in the server markup, so the form submits the selection without
 * JavaScript; the group takes them over with the same values when its script runs.
 */
function OptionGroup({
	name,
	label,
	options,
	selected,
}: {
	name: string;
	label: string;
	options: string[];
	selected: string[];
}) {
	return (
		<RuiDisclosure trigger={label} open class="product-filters__group">
			<RuiCheckboxGroup name={name} label={label} value={selected}>
				<RuiCheckboxGroupControl>
					{options.map((option) => (
						<RuiCheckbox name={name} value={option} checked={selected.includes(option)}>
							{option}
						</RuiCheckbox>
					))}
				</RuiCheckboxGroupControl>
			</RuiCheckboxGroup>
		</RuiDisclosure>
	);
}

function ActiveFilters({ filters }: { filters: ListingFilters }): JsxRenderable {
	const chips = [
		...filters.material.map((value) => ({
			label: value,
			next: { ...filters, material: filters.material.filter((item) => item !== value) },
		})),
		...filters.finish.map((value) => ({
			label: value,
			next: { ...filters, finish: filters.finish.filter((item) => item !== value) },
		})),
		...(filters.min !== undefined ? [{ label: `from $${filters.min}`, next: { ...filters, min: undefined } }] : []),
		...(filters.max !== undefined
			? [{ label: `up to $${filters.max}`, next: { ...filters, max: undefined } }]
			: []),
	];
	if (chips.length === 0) return null;
	return (
		<ul class="product-filters__active" aria-label="Active filters">
			{chips.map((chip) => (
				<li>
					<a href={listingUrl({ ...chip.next, page: 1 })} aria-label={`Remove filter ${chip.label}`}>
						<RuiChip variant="primary">{chip.label} ×</RuiChip>
					</a>
				</li>
			))}
		</ul>
	);
}

/**
 * The filter and sort form of a listing: a plain `GET /search` form.
 *
 * @remarks
 * Without JavaScript the Apply button submits it. With JavaScript `<product-filters>` applies each change as a
 * client navigation and offers the `filter_products` agent tool.
 */
export const ProductFilters = eco.component<ProductFiltersProps, JsxRenderable>({
	dependencies: {
		scripts: ['./product-filters.script.ts'],
	},
	render: ({ filters, facets }) => (
		<product-filters class="product-filters">
			<form action="/search" method="get" data-ref="form" aria-label="Filter products">
				{filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
				{filters.in ? <input type="hidden" name="in" value={filters.in} /> : null}
				<ActiveFilters filters={filters} />
				<RuiDisclosure trigger="Sort" open class="product-filters__group">
					<RadioChoices name="sort" label="Sort by" value={filters.sort} options={SORTS} />
				</RuiDisclosure>
				<RuiDisclosure trigger="Price" open class="product-filters__group">
					<div class="product-filters__price">
						<label>
							<span>Min $</span>
							<RuiInput
								type="number"
								name="min"
								min="0"
								value={filters.min === undefined ? '' : String(filters.min)}
							/>
						</label>
						<label>
							<span>Max $</span>
							<RuiInput
								type="number"
								name="max"
								min="0"
								value={filters.max === undefined ? '' : String(filters.max)}
							/>
						</label>
					</div>
				</RuiDisclosure>
				<OptionGroup name="material" label="Material" options={facets.materials} selected={filters.material} />
				<OptionGroup name="finish" label="Finish" options={facets.finishes} selected={filters.finish} />
				<RuiButton type="submit" variant="filled" class="product-filters__apply">
					Apply
				</RuiButton>
			</form>
		</product-filters>
	),
});
