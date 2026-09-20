/** Registers the Radiant UI custom elements rendered by the docs shell. */
import { createRouter } from '@ecopages/browser-router';
import { isServer } from '@ecopages/radiant/is-server';
import '@ecopages/radiant-ui/breadcrumb';
import '@ecopages/radiant-ui/sidebar';
import '@ecopages/radiant-ui/toc';

if (!isServer) {
	createRouter();
}
