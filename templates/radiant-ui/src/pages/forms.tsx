import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';
import { Section } from '@/components/blocks/section';
import { Heading } from '@/components/ui/heading';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup } from '@/components/ui/radio-group';
import { CheckboxGroup } from '@/components/ui/checkbox-group';
import { NumberField } from '@/components/ui/number-field';
import { DateField } from '@/components/ui/date-field';
import { Slider } from '@/components/ui/slider';

const COUNTRIES = [
	{ value: 'it', label: 'Italy' },
	{ value: 'de', label: 'Germany' },
	{ value: 'fr', label: 'France' },
	{ value: 'es', label: 'Spain' },
	{ value: 'pt', label: 'Portugal' },
];

const PLANS = [
	{ value: 'free', label: 'Free — one project' },
	{ value: 'pro', label: 'Pro — unlimited projects' },
	{ value: 'team', label: 'Team — shared workspaces' },
];

const TOPICS = [
	{ value: 'releases', label: 'Release notes' },
	{ value: 'guides', label: 'Guides and tutorials' },
	{ value: 'events', label: 'Events' },
];

/**
 * One form, every control.
 *
 * `Field` is the one place labels, hints, rules and the error slot live. It
 * registers the control inside it with the ancestor `Form`, which runs the
 * rules and paints each message back into that field's own error slot.
 */
export default eco.page<{}, JsxRenderable>({
	dependencies: {
		stylesheets: ['./forms.css'],
		components: [
			Section,
			Heading,
			Alert,
			Button,
			Form,
			Field,
			Input,
			Textarea,
			SearchableSelect,
			Combobox,
			Checkbox,
			Switch,
			RadioGroup,
			CheckboxGroup,
			NumberField,
			DateField,
			Slider,
		],
	},
	layout: { component: BaseLayout, props: () => ({ currentPath: '/forms' }) },
	metadata: () => ({
		title: 'Forms',
		description: 'Every Radiant UI control in one validated form.',
	}),
	render: () => (
		<>
			<Section spacing="lg" inset="compact">
				<Heading
					size="lg"
					eyebrow="Patterns"
					title="Forms"
					titleAs="h1"
					description="Field wraps every control: label, hint, rules and the error slot live there. Submit with fields empty to see validation run — the form host registers each field and paints its error back in place."
				/>
			</Section>

			<Section width="narrow" spacing="lg" inset="compact">
				<Alert variant="info" title="Client-side only">
					This form validates in the browser and posts nowhere. Point its <code>action</code> at your endpoint
					and the same markup works without JavaScript.
				</Alert>

				<Form
					class="signup"
					mode="onBlur"
					defaultValues={{ name: '', email: '', country: '', plan: 'pro', seats: 3 }}
					submitLabel="Create account"
				>
					<div class="signup__row">
						<Field name="name" label="Full name" rules={{ required: 'Enter your name' }}>
							<Input placeholder="Ada Lovelace" />
						</Field>
						<Field
							name="email"
							label="Email"
							description="We only mail about releases."
							rules={{
								required: 'Enter your email address',
								pattern: {
									value: /^[^@\s]+@[^@\s.]+\.[^@\s]+$/,
									message: 'Enter a valid email address',
								},
							}}
						>
							<Input type="email" placeholder="ada@example.com" />
						</Field>
					</div>

					<div class="signup__row">
						<Field name="country" label="Country" rules={{ required: 'Pick a country' }}>
							<SearchableSelect options={COUNTRIES} placeholder="Select a country" clearable />
						</Field>
						<Field name="language" label="Primary language">
							<Combobox options={COUNTRIES} placeholder="Search languages" clearable />
						</Field>
					</div>

					<Field name="plan" label="Plan">
						<RadioGroup name="plan" value="pro" options={PLANS} />
					</Field>

					<div class="signup__row">
						<Field name="seats" label="Seats">
							<NumberField defaultValue={3} minValue={1} maxValue={50} />
						</Field>
						<Field name="starts" label="Start date">
							<DateField value="2026-04-01" />
						</Field>
					</div>

					<Field name="budget" label="Monthly budget" description="Drag or use the arrow keys.">
						<Slider value={40} showValue />
					</Field>

					<Field name="topics" label="Send me" description="Change this any time from your account.">
						<CheckboxGroup options={TOPICS} value={['releases']} />
					</Field>

					<Field
						name="notes"
						label="Anything else?"
						rules={{ maxLength: { value: 500, message: 'Keep it under 500 characters' } }}
					>
						<Textarea rows={4} placeholder="Tell us what you are building…" />
					</Field>

					<Field name="terms" rules={{ required: 'You must accept the terms' }}>
						<Checkbox>I accept the terms of service</Checkbox>
					</Field>

					<Field name="updates">
						<Switch checked>Email me product updates</Switch>
					</Field>
				</Form>
			</Section>
		</>
	),
});
