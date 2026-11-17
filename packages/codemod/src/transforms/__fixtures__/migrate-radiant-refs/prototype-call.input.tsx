import { RadiantElement, customElement, query } from '@ecopages/radiant';

class Card extends RadiantElement {
	declare label: HTMLElement | null;
	declare labelText: HTMLElement | null;
	declare rows: HTMLElement[];
}

query({ ref: 'label' })(Card.prototype, 'label');
query({ ref: 'label-text' })(Card.prototype, 'labelText');
query({ ref: 'card-row', all: true })(Card.prototype, 'rows');
customElement('radiant-card')(Card);
