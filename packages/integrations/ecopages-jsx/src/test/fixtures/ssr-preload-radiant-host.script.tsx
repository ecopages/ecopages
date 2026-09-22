/** @jsxImportSource @ecopages/jsx */
import { RadiantElement, customElement, signal } from '@ecopages/radiant';

/**
 * Side-effect registration loaded only through `dependencies.scripts`.
 *
 * @remarks The host tag is duplicated in the Node preload integration test.
 * That test must not import this module, or registration would skip the
 * server-module loader.
 */
class SsrPreloadRadiantHost extends RadiantElement<{ label: number }> {
	declare label: number;

	override render() {
		return <span data-ssr-preload-radiant-host="true">{this.$.label}</span>;
	}
}

signal({ bind: true, hydrate: Number, initial: 1 })(SsrPreloadRadiantHost.prototype, 'label');
customElement('ecopages-jsx-ssr-preload-radiant-host')(SsrPreloadRadiantHost);
