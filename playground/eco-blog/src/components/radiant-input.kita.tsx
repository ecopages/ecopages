import { eco } from '@ecopages/core';
import type { RadiantInputProps } from './radiant-input.script';

export const RadiantInput = eco.component<RadiantInputProps>({
	dependencies: {
		lazy: {
			'on:interaction': 'mouseenter,focusin',
			scripts: ['./radiant-input.script.ts'],
		},
	},

	render: ({ value, label, name, required }) => {
		return (
			<radiant-input value={value} label={label} name={name} required={required}>
				<label class="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
				<input
					data-ref="input"
					type="text"
					name={name}
					value={value || ''}
					required={required}
					class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
				/>
			</radiant-input>
		);
	},
});
