import { createQuery } from '@ecopages/radiant/helpers/create-query';

export class Gallery extends HTMLElement {
	readonly title = createQuery<HTMLElement>(this, { ref: 'title' });
	readonly slides = createQuery(this, { ref: 'slide', all: true });
	readonly items = createQuery(this, { selector: '.item', all: true });
	readonly first = createQuery(this, { selector: '.item' });
}
