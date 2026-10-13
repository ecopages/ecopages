/**
 * Display — Static chrome and single-purpose indicators.
 *
 * One entry per component, rendered with the props you would actually
 * reach for. Split by family so no single file owns the whole catalog.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ComponentDemo } from '@/components/blocks/component-demo';
import { Heading } from '@/components/ui/heading';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Headline } from '@/components/ui/headline';
import { Meter } from '@/components/ui/meter';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { RuiCycleToggleItem } from '@ecopages/radiant-ui/cycle-toggle';
import { CycleToggle } from '@/components/ui/cycle-toggle';

export const DisplayDemos = eco.component<{}, JsxRenderable>({
	dependencies: {
		components: [
			ComponentDemo,
			Alert,
			Avatar,
			Badge,
			Button,
			ButtonGroup,
			CycleToggle,
			Heading,
			Headline,
			Meter,
			Separator,
			Spinner,
		],
	},
	render: () => (
		<>
			<ComponentDemo
				id="alert"
				name="Alert"
				summary="Picks its layout from the props — a title means banner, otherwise inline with a variant glyph."
			>
				<div class="alert-stack">
					<Alert variant="info">Your session expires in five minutes.</Alert>
					<Alert variant="warning" title="Scheduled maintenance">
						The dashboard is unavailable on Sunday from 02:00 to 04:00 UTC.
					</Alert>
					<Alert variant="error" dismissible>
						Could not reach the server.
					</Alert>
				</div>
			</ComponentDemo>

			<ComponentDemo
				id="avatar"
				name="Avatar"
				summary="Image with an initials fallback when there is nothing to load."
			>
				<Avatar fallback="JC" alt="Jane Cooper" size="sm" />
				<Avatar fallback="AR" alt="Ada Roberts" />
				<Avatar fallback="MT" alt="Milo Tan" size="lg" />
			</ComponentDemo>

			<ComponentDemo id="badge" name="Badge" summary="Static status pill; variant is the only knob.">
				<Badge>Filled</Badge>
				<Badge variant="outline">Outline</Badge>
				<Badge variant="muted">Muted</Badge>
				<Badge variant="destructive">Destructive</Badge>
			</ComponentDemo>

			<ComponentDemo
				id="button"
				name="Button"
				summary="Whole on its own; passing href gives a button-styled link with real link semantics."
			>
				<Button>Filled</Button>
				<Button variant="outline">Outline</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="destructive">Destructive</Button>
				<Button href="/about" variant="link" size="none">
					Link
				</Button>
			</ComponentDemo>

			<ComponentDemo
				id="button-group"
				name="ButtonGroup"
				summary="Styles the seams between its buttons; brings Button's chrome with it."
			>
				<ButtonGroup>
					<Button variant="outline">Day</Button>
					<Button variant="outline">Week</Button>
					<Button variant="outline">Month</Button>
				</ButtonGroup>
			</ComponentDemo>

			<ComponentDemo
				id="heading"
				name="Heading"
				summary="Eyebrow, title and lead paragraph as one type-scaled block."
			>
				<Heading eyebrow="Section" title="A section header" description="With a lead paragraph under it." />
			</ComponentDemo>

			<ComponentDemo id="headline" name="Headline" summary="One display-scale heading; as picks the level.">
				<Headline as="h3">Display headline</Headline>
			</ComponentDemo>

			<ComponentDemo
				id="meter"
				name="Meter"
				summary="A role=meter gauge for a known range. For progress, use a progress bar."
			>
				<Meter class="w-64" label="Disk usage" value={72} min={0} max={100} />
			</ComponentDemo>

			<ComponentDemo id="separator" name="Separator" summary="A rule with the right role in both orientations.">
				<div class="sep-demo">
					<span>Before</span>
					<Separator orientation="vertical" />
					<span>After</span>
				</div>
			</ComponentDemo>

			<ComponentDemo
				id="spinner"
				name="Spinner"
				summary="Pure CSS. Mark the surrounding region aria-busy so the wait is announced."
			>
				<Spinner size="sm" />
				<Spinner />
				<Spinner size="lg" />
			</ComponentDemo>

			<ComponentDemo
				id="cycle-toggle"
				name="CycleToggle"
				summary="One button that steps through a fixed set of states."
			>
				<CycleToggle>
					<RuiCycleToggleItem id="list" selected>
						List
					</RuiCycleToggleItem>
					<RuiCycleToggleItem id="grid">Grid</RuiCycleToggleItem>
					<RuiCycleToggleItem id="table">Table</RuiCycleToggleItem>
				</CycleToggle>
			</ComponentDemo>
		</>
	),
});
