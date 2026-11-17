import { RadiantElement, customElement, onEvent, query, queryAll, ref, refAll } from '@ecopages/radiant';
import { createQuery, createQueryAll } from '@ecopages/radiant/helpers/create-query';

const ITEM = '.item';

@customElement('migrated-list')
export class MigratedList extends RadiantElement {
	@ref() listRoot!: HTMLElement | null;
	@refAll('item') items!: HTMLElement[];
	@query('[data-audio]') audio!: HTMLAudioElement | null;
	@queryAll(ITEM) rows!: HTMLElement[];
	readonly first = createQuery(this, ITEM);
	readonly all = createQueryAll(this, `${ITEM}`);

	@onEvent({ ref: 'item', type: 'click' })
	select() {
		this.getRef('item');
	}

	override render() {
		return <ul data-ref="list-root" ref={(node) => node}></ul>;
	}
}
