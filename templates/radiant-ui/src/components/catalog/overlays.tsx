/**
 * Overlays — Layers and menus that sit above the page.
 *
 * One entry per component, rendered with the props you would actually
 * reach for. Split by family so no single file owns the whole catalog.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ComponentDemo } from '@/components/blocks/component-demo';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { HoverCard } from '@/components/ui/hover-card';
import { MenuButton } from '@/components/ui/menu-button';
import { Menubar } from '@/components/ui/menubar';
import { Popover } from '@/components/ui/popover';
import { Toolbar } from '@/components/ui/toolbar';
import { Tooltip } from '@/components/ui/tooltip';
import { RuiButton } from '@ecopages/radiant-ui/button';

export const OverlaysDemos = eco.component<{}, JsxRenderable>({
	dependencies: {
		components: [
			ComponentDemo,
			Avatar,
			Button,
			Checkbox,
			Dialog,
			HoverCard,
			MenuButton,
			Menubar,
			Popover,
			Toolbar,
			Tooltip,
		],
	},
	render: () => (
		<>
			<ComponentDemo
				id="dialog"
				name="Dialog"
				summary="Pass a trigger and the data-dialog-open wiring is done for you."
			>
				<Dialog
					id="catalog-dialog"
					title="Edit profile"
					trigger={<Button variant="outline">Open dialog</Button>}
					actions={
						<RuiButton type="button" data-dialog-close>
							Save
						</RuiButton>
					}
				>
					<p>Update your display name and email address.</p>
				</Dialog>
			</ComponentDemo>

			<ComponentDemo
				id="popover"
				name="Popover"
				summary="Nests the trigger, the host and the content in the one order that opens."
			>
				<Popover trigger={<RuiButton variant="outline">Extras</RuiButton>} contentClass="popover-body">
					<Checkbox checked>Pepperoni</Checkbox>
					<Checkbox>Mushroom</Checkbox>
				</Popover>
			</ComponentDemo>

			<ComponentDemo
				id="hover-card"
				name="HoverCard"
				summary="Trigger prop plus card body; opens on hover or focus."
			>
				<HoverCard trigger={<RuiButton variant="link">Jane Cooper</RuiButton>}>
					<div class="hovercard">
						<Avatar fallback="JC" alt="Jane Cooper" size="sm" />
						<span>Product designer on the Radiant team.</span>
					</div>
				</HoverCard>
			</ComponentDemo>

			<ComponentDemo
				id="tooltip"
				name="Tooltip"
				summary="Tip text in content, focusable trigger in children, aria-describedby between them."
			>
				<Tooltip content="Saves without leaving the page">
					<RuiButton variant="outline">Save</RuiButton>
				</Tooltip>
			</ComponentDemo>

			<ComponentDemo
				id="menu-button"
				name="MenuButton"
				summary="Trigger and items build the button, the floating menu and its entries."
			>
				<MenuButton
					trigger={<RuiButton variant="outline">Actions</RuiButton>}
					items={[
						{ value: 'edit', label: 'Edit' },
						{ value: 'duplicate', label: 'Duplicate' },
						{ type: 'separator' },
						{ value: 'delete', label: 'Delete' },
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="menubar"
				name="Menubar"
				summary="Each item is a top-level menu with its own entries and the APG keyboard model."
			>
				<Menubar
					label="Editor"
					items={[
						{
							id: 'file',
							label: 'File',
							items: [
								{ value: 'new', label: 'New' },
								{ value: 'open', label: 'Open' },
							],
						},
						{
							id: 'edit',
							label: 'Edit',
							items: [
								{ value: 'undo', label: 'Undo' },
								{ value: 'redo', label: 'Redo' },
							],
						},
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="toolbar"
				name="Toolbar"
				summary="Takes over arrow-key navigation between the controls inside it."
			>
				<Toolbar label="Text formatting">
					<RuiButton size="sm" variant="ghost" toggle>
						Bold
					</RuiButton>
					<RuiButton size="sm" variant="ghost" toggle>
						Italic
					</RuiButton>
					<RuiButton size="sm" variant="ghost" toggle>
						Underline
					</RuiButton>
				</Toolbar>
			</ComponentDemo>
		</>
	),
});
