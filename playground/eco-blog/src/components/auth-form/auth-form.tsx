import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiInput } from '@ecopages/radiant-ui/input';
import './auth-form.css';

type AuthField = {
	name: 'name' | 'email' | 'password';
	label: string;
	type: 'text' | 'email' | 'password';
	autocomplete: string;
};

type AuthFormProps = {
	title: string;
	intro: string;
	action: string;
	submitLabel: string;
	fields: AuthField[];
	footer: JsxRenderable;
};

/** Sign-in and sign-up card; `auth-form.script.ts` posts it as JSON to Better Auth. */
export const AuthForm = eco.component<AuthFormProps, JsxRenderable>({
	dependencies: { scripts: ['./auth-form.script.ts'] },
	render: ({ title, intro, action, submitLabel, fields, footer }) => (
		<section class="auth-card" aria-labelledby="auth-title">
			<header class="auth-card__header">
				<h1 id="auth-title">{title}</h1>
				<p>{intro}</p>
			</header>
			<form class="auth-card__form" action={action} method="post" data-auth-form data-redirect="/admin">
				{fields.map((field) => (
					<div class="auth-card__field">
						<label class="rui-label" for={`auth-${field.name}`}>
							{field.label}
						</label>
						<RuiInput
							id={`auth-${field.name}`}
							name={field.name}
							type={field.type}
							attr:autocomplete={field.autocomplete}
							attr:required=""
						/>
					</div>
				))}
				<p class="auth-card__error" role="alert" data-auth-error hidden></p>
				<RuiButton type="submit" variant="filled" size="lg">
					{submitLabel}
				</RuiButton>
			</form>
			<p class="auth-card__footer">{footer}</p>
		</section>
	),
});
