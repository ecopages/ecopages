import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import type { RadiantCodeTabsProps } from './code-tabs.script';
import { highlightCodeTab, type CodeTabSource } from '@/lib/docs/code-highlighter';
import './code-tabs.css';

export const CodeTabs = eco.component({
	dependencies: {
		scripts: [{ src: './code-tabs.script.tsx', ssr: true }],
	},
	render(
		props: JsxCustomElementAttributes<HTMLElement, Omit<RadiantCodeTabsProps, 'tabs'> & { tabs?: CodeTabSource[] }>,
	) {
		const className = props.class ? `unstyled ${props.class}` : 'unstyled';

		const tabs = props.tabs?.map((tab) => ('html' in tab ? tab : highlightCodeTab(tab)));

		return (
			<radiant-code-tabs
				class={className}
				name={props.name}
				prop:label={props.label}
				prop:tabs={tabs}
				prop:copyLabel={props.copyLabel}
				prop:defaultSelectedKey={props.defaultSelectedKey}
				prop:selectedKey={props.selectedKey}
			/>
		);
	},
});
