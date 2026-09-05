/**
 * Browser entry for the `field` custom element(s).
 *
 * Importing the module runs Radiant's `@customElement` registration. After
 * upgrade, `pattern` rules are still the JSON `{ source, flags }` payload
 * `encodeFieldRules` painted. Revive them here so `.test` runs on a `RegExp`.
 *
 * `Field` lists this file (not `field.script.ts`) so registration and revive
 * share one module.
 */
import '@ecopages/radiant-ui/field';
import type { FieldRules } from '@ecopages/radiant-ui/form';
import { reviveFieldRules } from './field-rules';

type FieldHost = HTMLElement & { rules?: FieldRules };

function reviveHost(host: FieldHost) {
	reviveFieldRules(host.rules);
}

for (const host of document.querySelectorAll('rui-field')) {
	reviveHost(host as FieldHost);
}

const FieldElement = customElements.get('rui-field');

if (FieldElement) {
	const connect = FieldElement.prototype.connectedCallback;
	FieldElement.prototype.connectedCallback = function connectedCallback(this: FieldHost) {
		reviveHost(this);
		connect?.call(this);
	};
}
