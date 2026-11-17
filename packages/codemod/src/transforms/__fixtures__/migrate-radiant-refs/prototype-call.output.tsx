import { RadiantElement, customElement, ref, refAll } from '@ecopages/radiant';

class Card extends RadiantElement {
	declare label: HTMLElement | null;
	declare labelText: HTMLElement | null;
	declare rows: HTMLElement[];
}

ref()(Card.prototype, 'label');
ref()(Card.prototype, 'labelText');
refAll('card-row')(Card.prototype, 'rows');
customElement('radiant-card')(Card);
