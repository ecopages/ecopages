/**
 * Selection — Picking one or many values out of a set.
 *
 * One entry per component, rendered with the props you would actually
 * reach for. Split by family so no single file owns the whole catalog.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ComponentDemo } from '@/components/blocks/component-demo';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Chip } from '@/components/ui/chip';
import { ChipList } from '@/components/ui/chip-list';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { Listbox } from '@/components/ui/listbox';
import { Select } from '@/components/ui/select';
import { TagGroup } from '@/components/ui/tag-group';
import { FRUIT } from './demo-data';

export const SelectionDemos = eco.component<{}, JsxRenderable>({
	dependencies: {
		components: [ComponentDemo, Autocomplete, Chip, ChipList, Combobox, Field, Listbox, Select, TagGroup],
	},
	render: () => (
		<>
			<ComponentDemo
				id="select"
				name="Select"
				summary="Trigger, value display and embedded listbox — tag chips when multiple."
			>
				<Field class="w-56" name="pick" label="Fruit">
					<Select options={FRUIT} value="cherry" placeholder="Pick one" clearable searchable />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="combobox"
				name="Combobox"
				summary="Text input, toggle and filtered listbox from a single options array."
			>
				<Field class="w-72" name="fruit" label="Fruit">
					<Combobox options={FRUIT} placeholder="Pick a fruit" clearable />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="listbox"
				name="Listbox"
				summary="Options get their roles, selection indicators and keyboard wiring."
			>
				<Field class="w-56" name="listbox-fruit" label="Fruit">
					<Listbox options={FRUIT} value="banana" bordered />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="autocomplete"
				name="Autocomplete"
				summary="Stamps the search input, the filtered collection, and the empty state."
			>
				<Autocomplete placeholder="Filter fruit…" class="w-72">
					<Listbox options={FRUIT} bordered />
				</Autocomplete>
			</ComponentDemo>

			<ComponentDemo
				id="tag-group"
				name="TagGroup"
				summary="Each tag gets its remove control and a place in the keyboard model."
			>
				<TagGroup
					label="Topics"
					tags={[
						{ value: 'news', label: 'News' },
						{ value: 'travel', label: 'Travel' },
						{ value: 'food', label: 'Food' },
					]}
				/>
			</ComponentDemo>

			<ComponentDemo id="chip" name="Chip" summary="A static token. Use TagGroup when they need to be removable.">
				<Chip>Default</Chip>
				<Chip variant="muted">Muted</Chip>
				<Chip variant="primary">Primary</Chip>
			</ComponentDemo>

			<ComponentDemo
				id="chip-list"
				name="ChipList"
				summary="Wraps each item in a list item so a list of chips stays a list."
			>
				<ChipList items={[<Chip>Ecopages</Chip>, <Chip>Radiant</Chip>, <Chip>Tailwind</Chip>]} />
			</ComponentDemo>
		</>
	),
});
