import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { queryAll } from '@ecopages/radiant/decorators/query';
import { refAll } from '@ecopages/radiant/decorators/ref';

export class Tabs extends RadiantElement {
	@refAll('tab') tabs!: HTMLElement[];
	@queryAll('[role="tabpanel"]') panels!: HTMLElement[];
}
