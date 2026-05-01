import { eco } from '@ecopages/core';
import type { RadiantCodeTabsProps } from './code-tabs.script';
import './code-tabs.script';

export const CodeTabs = eco.component({
	dependencies: {
		scripts: ['./code-tabs.script.tsx'],
		stylesheets: ['./code-tabs.css'],
	},
	render(props: RadiantCodeTabsProps & { class?: string }) {
		return (
			<radiant-code-tabs
				class={props.class}
				prop:name={props.name}
				prop:label={props.label}
				prop:tabs={props.tabs}
				prop:copyLabel={props.copyLabel}
				prop:defaultSelectedKey={props.defaultSelectedKey}
				prop:selectedKey={props.selectedKey}
			></radiant-code-tabs>
		);
	},
});
