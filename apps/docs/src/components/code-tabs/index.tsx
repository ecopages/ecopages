import { eco } from '@ecopages/core';
import type { RadiantCodeTabsProps } from './code-tabs.script';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import './code-tabs.script';

export const CodeTabs = eco.component({
	dependencies: {
		scripts: ['./code-tabs.script.tsx'],
		stylesheets: ['./code-tabs.css'],
	},
	render(props: JsxCustomElementAttributes<HTMLElement, RadiantCodeTabsProps>) {
		return (
			<radiant-code-tabs
				class={props.class}
				name={props.name}
				label={props.label}
				tabs={props.tabs}
				copyLabel={props.copyLabel}
				defaultSelectedKey={props.defaultSelectedKey}
				selectedKey={props.selectedKey}
			/>
		);
	},
});
