/**
 * Data — Collections, grids and the widgets that navigate them.
 *
 * One entry per component, rendered with the props you would actually
 * reach for. Split by family so no single file owns the whole catalog.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ComponentDemo } from '@/components/blocks/component-demo';
import { Carousel } from '@/components/ui/carousel';
import { Feed } from '@/components/ui/feed';
import { Grid } from '@/components/ui/grid';
import { Table } from '@/components/ui/table';
import { Tree } from '@/components/ui/tree';
import { Treegrid } from '@/components/ui/treegrid';
import { WindowSplitter } from '@/components/ui/window-splitter';

export const DataDemos = eco.component<{}, JsxRenderable>({
	dependencies: { components: [ComponentDemo, Carousel, Feed, Grid, Table, Tree, Treegrid, WindowSplitter] },
	render: () => (
		<>
			<ComponentDemo
				id="table"
				name="Table"
				summary="Columns and rows lay the cells out; the first column becomes the row header."
			>
				<Table
					class="w-full"
					label="Releases"
					selectionMode="multiple"
					columns={[
						{ id: 'name', label: 'Package', isRowHeader: true },
						{ id: 'version', label: 'Version', allowsSorting: true },
						{ id: 'size', label: 'Size' },
					]}
					rows={[
						{ id: 'ui', cells: { name: 'radiant-ui', version: '0.1.0-rc.11', size: '84 kB' } },
						{ id: 'radiant', cells: { name: 'radiant', version: '0.3.0-rc.5', size: '21 kB' } },
						{ id: 'jsx', cells: { name: 'jsx', version: '0.3.0-rc.5', size: '9 kB' } },
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="tree"
				name="Tree"
				summary="Nodes with children become the roles, expand state and keyboard model."
			>
				<Tree
					label="Project"
					nodes={[
						{
							id: 'src',
							label: 'src',
							expanded: true,
							children: [
								{ id: 'components', label: 'components' },
								{ id: 'pages', label: 'pages' },
							],
						},
						{ id: 'config', label: 'eco.config.ts' },
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="treegrid"
				name="Treegrid"
				summary="A tree and a grid at once — expandable rows with navigable cells."
			>
				<Treegrid
					class="w-full"
					label="Files"
					columns={['Name', 'Size']}
					rows={[
						{
							id: 'src',
							cells: ['src', '—'],
							expanded: true,
							children: [{ id: 'index', cells: ['index.tsx', '4 kB'] }],
						},
						{ id: 'readme', cells: ['README.md', '2 kB'] },
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="grid"
				name="Grid"
				summary="An APG interactive grid — arrow keys move a roving focus between cells."
			>
				<Grid
					label="Quarterly"
					rows={[
						['Q1', '12', '18'],
						['Q2', '15', '22'],
						['Q3', '19', '24'],
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="feed"
				name="Feed"
				summary="Counts aria-posinset and aria-setsize across the entries for you."
			>
				<Feed
					label="Updates"
					class="w-full"
					articles={[
						{
							header: <strong>Radiant UI rc.11</strong>,
							content: <p>Fifty-six components, all with compiled CSS.</p>,
						},
						{
							header: <strong>Blocks</strong>,
							content: <p>Page sections composed from the catalog.</p>,
						},
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="carousel"
				name="Carousel"
				summary="Data-driven slides with a live region, controls and indicators."
			>
				<Carousel
					label="Colours"
					class="w-full"
					showIndicators
					slides={[
						{ id: 's1', children: <div class="swatch swatch--1">One</div> },
						{ id: 's2', children: <div class="swatch swatch--2">Two</div> },
						{ id: 's3', children: <div class="swatch swatch--3">Three</div> },
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="window-splitter"
				name="WindowSplitter"
				summary="Two resizable panes and a keyboard-operable separator between them."
			>
				<WindowSplitter
					class="w-full splitter"
					label="Editor"
					value={40}
					primary={<div class="pane">Navigator</div>}
					secondary={<div class="pane">Editor</div>}
				/>
			</ComponentDemo>
		</>
	),
});
