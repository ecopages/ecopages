/**
 * Newsletter — an email capture band.
 *
 * The form is a real `Form` + `Field`, so the email rule is enforced by the
 * same validation store every other form on the site uses, and the error lands
 * in the field's own error slot rather than in an alert somewhere else.
 *
 * `action` and `method` pass through to the underlying `<form>`, so this posts
 * to your endpoint with or without JavaScript.
 *
 * Copy sits beside the capture on a wide screen so the title and the submit
 * control share a baseline rather than stacking as a centred column.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { Heading } from '@/components/ui/heading';
import { Form } from '@/components/ui/form';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Section, type SectionProps } from '../section';

export type NewsletterProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'inset' | 'class'> & {
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
		components: [Section, Heading, Form, Field, Input, Button],
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
		<Section {...section} width="default" class={cx('newsletter', className)}>
			<div class="newsletter__layout">
				<Heading
					class="newsletter__copy"
					align="start"
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
				<div class="newsletter__capture">
					<Form
						class="newsletter__form"
						action={action}
						method={method}
						mode="onBlur"
						defaultValues={{ [name]: '' }}
						actions={<Button type="submit">{submitLabel}</Button>}
					>
						<Field
							class="newsletter__field"
							name={name}
							rules={{
								required: 'Enter your email address',
								pattern: {
									value: /^[^@\s]+@[^@\s.]+\.[^@\s]+$/,
									message: 'Enter a valid email address',
								},
							}}
						>
							<RuiInput type="email" name={name} placeholder={placeholder} aria-label={label} />
						</Field>
					</Form>
					{note ? <p class="newsletter__note">{note}</p> : null}
				</div>
			</div>
		</Section>
	),
});
