import { eco } from '@ecopages/core';

export const ApiField = eco.component<{
	name: string;
	type: string;
	defaultValue: string;
	mandatory: boolean;
	children: string;
}>({
	dependencies: {
		stylesheets: ['./api-field.css'],
	},
	render: ({ name, defaultValue, mandatory, type, children }) => {
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
					{defaultValue ? (
						<span class="api-field__default-value">@default: {defaultValue as 'safe'}</span>
					) : null}
				</div>
				{children as 'safe'}
			</div>
		);
	},
});
