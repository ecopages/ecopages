/**
 * Newsletter — an email capture band.
 *
 * The form is a real `Form` + `Field`, so the email rule is enforced by the
 * same validation store every other form on the site uses, and the error lands
 * in the field's own error slot rather than in an alert somewhere else.
 *
 * `action` and `method` pass through to the underlying `<form>`, so this posts
 * to your endpoint with or without JavaScript.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { Heading } from '@/components/ui/heading';
import { Form } from '@/components/ui/form';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Section, type SectionProps } from '../section';

export type NewsletterProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'class'> & {
	eyebrow?: JsxRenderable;
	title: JsxRenderable;
	description?: JsxRenderable;
	/** Where the form posts. */
	action?: string;
	method?: 'get' | 'post';
	/** Field name for the email input. Default: `email`. */
	name?: string;
	label?: string;
	placeholder?: string;
	/** Small print under the form — a privacy note. */
	note?: JsxRenderable;
	submitLabel?: string;
};

export const Newsletter = eco.component<NewsletterProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./newsletter.css'],
		components: [Section, Heading, Form, Field, Input],
	},
	render: ({
		eyebrow,
		title,
		description,
		action,
		method = 'post',
		name = 'email',
		label = 'Email address',
		placeholder = 'you@example.com',
		note,
		submitLabel = 'Subscribe',
		class: className,
		...section
	}) => (
		<Section {...section} width="narrow" class={cx('newsletter', className)}>
			<Heading
				class="newsletter__copy"
				align="center"
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			<Form
				class="newsletter__form"
				action={action}
				method={method}
				mode="onBlur"
				defaultValues={{ [name]: '' }}
				submitLabel={submitLabel}
			>
				<Field
					class="newsletter__field"
					name={name}
					rules={{
						required: 'Enter your email address',
						pattern: { value: /^[^@\s]+@[^@\s.]+\.[^@\s]+$/, message: 'Enter a valid email address' },
					}}
				>
					<RuiInput type="email" name={name} placeholder={placeholder} aria-label={label} />
				</Field>
			</Form>
			{note ? <p class="newsletter__note">{note}</p> : null}
		</Section>
	),
});
