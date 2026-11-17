import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { query } from '@ecopages/radiant/decorators/query';

export class Tabs extends RadiantElement {
	@query({ ref: 'tab', all: true }) tabs!: HTMLElement[];
	@query({ selector: '[role="tabpanel"]', all: true }) panels!: HTMLElement[];
}
