/**
 * Inputs — Controls a form is built from.
 *
 * One entry per component, rendered with the props you would actually
 * reach for. Split by family so no single file owns the whole catalog.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ComponentDemo } from '@/components/blocks/component-demo';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckboxGroup } from '@/components/ui/checkbox-group';
import { Field } from '@/components/ui/field';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { InputGroup } from '@/components/ui/input-group';
import { Knob } from '@/components/ui/knob';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/number-field';
import { RadioGroup } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FRUIT } from './demo-data';

export const InputsDemos = eco.component<{}, JsxRenderable>({
	dependencies: {
		components: [
			ComponentDemo,
			Checkbox,
			CheckboxGroup,
			Field,
			Form,
			Input,
			InputGroup,
			Knob,
			Label,
			NumberField,
			RadioGroup,
			Slider,
			Switch,
			Textarea,
		],
	},
	render: () => (
		<>
			<ComponentDemo
				id="field"
				name="Field"
				summary="Label, control, hint and the error slot the host fills in — always in that order."
			>
				<Field class="w-72" name="email" label="Email" description="We only mail about releases.">
					<Input type="email" placeholder="you@example.com" />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="form"
				name="Form"
				summary="Runs each Field's rules and paints errors back; submitLabel adds the action row."
			>
				<Form class="w-72" mode="onBlur" defaultValues={{ name: '' }} submitLabel="Save">
					<Field name="name" label="Name" rules={{ required: 'Name is required' }}>
						<Input placeholder="Ada Lovelace" />
					</Field>
				</Form>
			</ComponentDemo>

			<ComponentDemo
				id="input"
				name="Input"
				summary="A styled input; wrap in Field for a label, or InputGroup for affixes."
			>
				<Field class="w-56" name="project" label="Project name">
					<Input placeholder="Acme" />
				</Field>
				<Input placeholder="No label" disabled class="w-56" />
			</ComponentDemo>

			<ComponentDemo
				id="input-group"
				name="InputGroup"
				summary="String addons get the muted text treatment; anything else renders as-is."
			>
				<InputGroup class="w-72" start="https://">
					<Input placeholder="example.com" />
				</InputGroup>
				<InputGroup class="w-56" start="$" end=".00">
					<Input placeholder="0" />
				</InputGroup>
			</ComponentDemo>

			<ComponentDemo
				id="textarea"
				name="Textarea"
				summary="A styled textarea; wrap in Field for a label, hint and error."
			>
				<Field class="w-72" name="notes" label="Notes">
					<Textarea rows={3} placeholder="Tell us more…" />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="label"
				name="Label"
				summary="Field renders one for you; reach for this only outside a field."
			>
				<Label htmlFor="standalone-input">Standalone label</Label>
				<Input id="standalone-input" placeholder="Associated input" class="w-56" />
			</ComponentDemo>

			<ComponentDemo
				id="checkbox"
				name="Checkbox"
				summary="Children are the label, already associated with the input."
			>
				<Checkbox>Accept terms</Checkbox>
				<Checkbox checked>Subscribed</Checkbox>
				<Checkbox indeterminate>Partial</Checkbox>
				<Checkbox disabled>Disabled</Checkbox>
			</ComponentDemo>

			<ComponentDemo
				id="checkbox-group"
				name="CheckboxGroup"
				summary="One checkbox per option, with the group's selection wiring."
			>
				<Field name="toppings" label="Toppings">
					<CheckboxGroup options={FRUIT} value={['apple']} />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="radio-group"
				name="RadioGroup"
				summary="One radio per option, with the group's roving-focus keyboard model."
			>
				<Field name="plan" label="Plan">
					<RadioGroup
						name="plan"
						value="pro"
						options={[
							{ value: 'free', label: 'Free' },
							{ value: 'pro', label: 'Pro' },
							{ value: 'team', label: 'Team' },
						]}
					/>
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="switch"
				name="Switch"
				summary="For settings that apply immediately; Checkbox for values you submit."
			>
				<Switch>Notifications</Switch>
				<Switch checked>Auto-save</Switch>
			</ComponentDemo>

			<ComponentDemo
				id="slider"
				name="Slider"
				summary="Track, thumbs and the value readout; a pair makes it a range."
			>
				<Field class="w-64" name="volume" label="Volume">
					<Slider value={[40]} showValue />
				</Field>
				<Field class="w-64" name="price" label="Price">
					<Slider value={[20, 70]} showValue />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="number-field"
				name="NumberField"
				summary="Input plus increment and decrement steppers, stamped by the host."
			>
				<Field name="quantity" label="Quantity">
					<NumberField defaultValue={3} minValue={0} maxValue={10} />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="knob"
				name="Knob"
				summary="A rotary role=slider; the host draws the ring and the readout."
			>
				<Knob label="Gain" value={64} />
			</ComponentDemo>
		</>
	),
});
