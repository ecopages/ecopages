import { RadiantComponent, state } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';

type TocItem = {
	id: string;
	label: string;
	depth: 2 | 3;
};

@customElement('radiant-toc')
export class RadiantToc extends RadiantComponent {
	@state tocItems: TocItem[] = [];
	@state activeHeadingId = '';

	private cleanupScrollTracking: (() => void) | null = null;
	private pendingScrollTargetId: string | null = null;
	private readonly scrollOffset = 120;
	private readonly scrollOffsetTolerance = 4;
	private headings: HTMLElement[] = [];

	override connectedCallback(): void {
		super.connectedCallback();
		this.renderToc();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.cleanupScrollTracking?.();
		this.cleanupScrollTracking = null;
	}

	@onEvent({ document: true, type: 'eco:page-load' })
	onPageLoad(): void {
		this.renderToc();
	}

	@onEvent({ document: true, type: 'eco:after-swap' })
	onAfterSwap(): void {
		this.renderToc();
	}

	renderToc(): void {
		const content = document.querySelector('.docs-layout__content');
		if (!content) {
			this.tocItems = [];
			this.activeHeadingId = '';
			return;
		}

		const headings = Array.from(content.querySelectorAll<HTMLElement>('h2, h3'));
		if (headings.length === 0) {
			this.cleanupScrollTracking?.();
			this.cleanupScrollTracking = null;
			this.headings = [];
			this.pendingScrollTargetId = null;
			this.tocItems = [];
			this.activeHeadingId = '';
			return;
		}

		const usedHeadingIds = new Set<string>();
		this.headings = headings;
		this.tocItems = headings.map((heading) => {
			const id = this.getUniqueHeadingId(heading, usedHeadingIds);
			heading.id = id;
			return {
				id,
				label: (heading.textContent || '').trim(),
				depth: heading.tagName.toLowerCase() === 'h3' ? 3 : 2,
			};
		});
		this.setupObserver(headings);
	}

	private getUniqueHeadingId(heading: HTMLElement, usedHeadingIds: Set<string>): string {
		const requestedId = heading.id.trim();
		const baseId = requestedId || this.slugifyHeadingLabel(heading.textContent || 'section');
		let candidateId = baseId || 'section';
		let suffix = 2;

		while (usedHeadingIds.has(candidateId)) {
			candidateId = `${baseId || 'section'}-${String(suffix)}`;
			suffix += 1;
		}

		usedHeadingIds.add(candidateId);
		return candidateId;
	}

	private slugifyHeadingLabel(value: string): string {
		return (
			value
				.trim()
				.toLowerCase()
				.replace(/\s+/g, '-')
				.replace(/[^\w-]/g, '')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '') || 'section'
		);
	}

	private scrollToHeading(id: string, heading: HTMLElement): void {
		const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

		window.history.replaceState(
			window.history.state,
			'',
			`${window.location.pathname}${window.location.search}#${id}`,
		);
		heading.scrollIntoView({ behavior, block: 'start' });
	}

	private hasPendingScrollReachedTarget(heading: HTMLElement): boolean {
		const headingTop = heading.getBoundingClientRect().top;
		return (
			headingTop <= this.scrollOffset + this.scrollOffsetTolerance && headingTop >= -this.scrollOffsetTolerance
		);
	}

	private findHeadingById(id: string): HTMLElement | null {
		return this.headings.find((heading) => heading.id === id) ?? null;
	}

	private setActiveHeading(id: string): void {
		if (this.activeHeadingId === id) {
			return;
		}

		this.activeHeadingId = id;
	}

	private readonly handleTocClick = (
		event: PointerEvent & { readonly currentTarget: HTMLAnchorElement },
		id: string,
	) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}

		const heading = this.findHeadingById(id);
		if (!heading) {
			return;
		}

		event.preventDefault();
		this.pendingScrollTargetId = id;
		this.setActiveHeading(id);
		this.scrollToHeading(id, heading);
	};

	private readonly getTocClickHandler = (id: string) => {
		return {
			handleEvent: (event: PointerEvent & { readonly currentTarget: HTMLAnchorElement }) => {
				this.handleTocClick(event, id);
			},
		};
	};

	setupObserver(headings: HTMLElement[]): void {
		this.cleanupScrollTracking?.();
		this.cleanupScrollTracking = null;
		let rafPending = false;

		const updateActive = () => {
			if (headings.length === 0) return;

			const isAtBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 10;

			if (isAtBottom) {
				this.pendingScrollTargetId = null;
				const lastId = headings[headings.length - 1]?.id;
				if (lastId) {
					this.setActiveHeading(lastId);
				}
				return;
			}

			if (this.pendingScrollTargetId) {
				const pendingHeading = this.findHeadingById(this.pendingScrollTargetId);
				if (!pendingHeading) {
					this.pendingScrollTargetId = null;
				} else if (!this.hasPendingScrollReachedTarget(pendingHeading)) {
					this.setActiveHeading(this.pendingScrollTargetId);
					return;
				} else {
					this.pendingScrollTargetId = null;
				}
			}

			let activeId: string | null = null;
			for (const heading of headings) {
				if (heading.getBoundingClientRect().top <= this.scrollOffset + this.scrollOffsetTolerance) {
					activeId = heading.id;
				} else {
					break;
				}
			}

			if (activeId) {
				this.setActiveHeading(activeId);
			}
		};

		const onScroll = () => {
			if (rafPending) return;
			rafPending = true;
			requestAnimationFrame(() => {
				updateActive();
				rafPending = false;
			});
		};

		window.addEventListener('scroll', onScroll, { passive: true });
		this.cleanupScrollTracking = () => {
			window.removeEventListener('scroll', onScroll);
		};
		updateActive();
	}

	override render() {
		if (this.tocItems.length === 0) {
			return null;
		}

		return (
			<>
				<h3>On this page</h3>
				<ul>
					{this.tocItems.map((item) => {
						const isActive = item.id === this.activeHeadingId;
						const className = [item.depth === 3 ? 'toc-depth-3' : '', isActive ? 'toc-active' : '']
							.filter(Boolean)
							.join(' ');
						return (
							<li key={item.id}>
								<a
									href={`#${item.id}`}
									data-toc-link={item.id}
									class={className || undefined}
									aria-current={isActive ? 'location' : undefined}
									on:click={this.getTocClickHandler(item.id)}
								>
									{item.label}
								</a>
							</li>
						);
					})}
				</ul>
			</>
		);
	}
}
