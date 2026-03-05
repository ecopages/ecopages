import type { EcoComponent } from '@ecopages/core';
import type { PropsWithChildren } from '@kitajs/html';

export type CodeTabProps = PropsWithChildren<{
	name: string;
}>;

export const CodeTab: EcoComponent<CodeTabProps> = ({ name, children }) => {
	return (
		<div class="code-tab-panel" data-name={name} role="tabpanel" tabindex="0">
			{children}
		</div>
	);
};

export const CodeSnippetTabs: EcoComponent<PropsWithChildren> = ({ children }) => {
	return (
		<radiant-code-tabs class="code-snippet-tabs">
			<div class="code-tabs-header" role="tablist"></div>
			<div class="code-tabs-content">{children}</div>
		</radiant-code-tabs>
	);
};

CodeSnippetTabs.config = {
	dependencies: {
		stylesheets: ['./code-snippet-tabs.css'],
		scripts: ['./code-snippet-tabs.script.ts'],
	},
};
