import { createQuery, createQueryAll } from '@ecopages/radiant/helpers/create-query';

export class Gallery extends HTMLElement {
	readonly title = createQuery<HTMLElement>(this, '[data-ref="title"]');
	readonly slides = createQueryAll(this, '[data-ref="slide"]');
	readonly items = createQueryAll(this, '.item');
	readonly first = createQuery(this, '.item');
}
