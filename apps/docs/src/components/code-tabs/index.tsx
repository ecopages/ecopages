import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import type { RadiantCodeTabsProps } from './code-tabs.script';
import './code-tabs.css';

export const CodeTabs = eco.component({
	dependencies: {
		scripts: [{ src: './code-tabs.script.tsx', ssr: true }],
	},
	render(props: JsxCustomElementAttributes<HTMLElement, RadiantCodeTabsProps>) {
		const className = props.class ? `unstyled ${props.class}` : 'unstyled';

		return (
			<radiant-code-tabs
				class={className}
				name={props.name}
				prop:label={props.label}
				prop:tabs={props.tabs}
				prop:copyLabel={props.copyLabel}
				prop:defaultSelectedKey={props.defaultSelectedKey}
				prop:selectedKey={props.selectedKey}
			/>
		);
	},
});
