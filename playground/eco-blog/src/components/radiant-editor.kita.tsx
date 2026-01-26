import { eco } from '@ecopages/core';
import type { RadiantEditorProps } from './radiant-editor.script';

export const RadiantEditor = eco.component<RadiantEditorProps & { name: string }>({
	dependencies: {
		lazy: {
			'on:interaction': 'mouseenter,focusin',
			scripts: ['./radiant-editor.script.ts'],
		},
	},

	render: ({ content, name }) => {
		return (
			<radiant-editor>
				<div class="flex flex-col gap-2 relative">
					<div
						class="flex items-center gap-1 p-2 bg-slate-50 border border-slate-200 rounded-t-xl border-b-0 sticky top-0 z-10"
						data-ref="toolbar"
					></div>
					<div
						data-ref="editor"
						class="min-h-150 bg-slate-50 border border-slate-200 rounded-b-xl p-4 prose prose-indigo max-w-none focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all outline-none"
					></div>
				</div>
				<input type="hidden" data-ref="content-input" name={name} value={content || ''} />
			</radiant-editor>
		);
	},
});
