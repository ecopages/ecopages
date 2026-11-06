import type { JsxRenderable } from '@ecopages/jsx';
import './api-field.css';

export function ApiField({
	name,
	defaultValue,
	mandatory,
	type,
	children,
}: {
	name: string;
	type: string;
	defaultValue: string;
	mandatory: boolean;
	children: string;
}): JsxRenderable {
	return (
		<div class="api-field">
			<div class="api-field__top-line">
				<div>
					<span class="api-field__name" safe>
						{mandatory ? `${name}*` : name}
					</span>
					<span class="api-field__type" safe>
						{type}
					</span>
				</div>
				{defaultValue ? <span class="api-field__default-value">@default: {defaultValue as 'safe'}</span> : null}
			</div>
			{children as 'safe'}
		</div>
	);
}
