import type { DevToolbarPlacement } from '../runtime/preferences.ts';

const TOOLBAR_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function prefersReducedMotion(): boolean {
	return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function cancelElementAnimations(element: HTMLElement): void {
	for (const animation of element.getAnimations()) {
		animation.cancel();
	}
}

function setMotionActive(element: HTMLElement, active: boolean): void {
	if (active) {
		element.dataset.motion = 'active';
		return;
	}

	delete element.dataset.motion;
}

function finishMotion(element: HTMLElement, animation: Animation): void {
	const cleanup = (): void => {
		setMotionActive(element, false);
	};

	animation.addEventListener('finish', cleanup, { once: true });
	animation.addEventListener('cancel', cleanup, { once: true });
}

function resolveStealthPeek(shell: HTMLElement): string {
	const value = getComputedStyle(shell).getPropertyValue('--eco-dev-toolbar-stealth-peek').trim();
	return value || '0.12rem';
}

function hiddenShellTransform(shell: HTMLElement, placement: DevToolbarPlacement): string {
	const peek = resolveStealthPeek(shell);
	switch (placement) {
		case 'top':
			return `translateY(calc(-100% + ${peek}))`;
		case 'left':
			return `translateX(calc(-100% + ${peek}))`;
		case 'right':
			return `translateX(calc(100% - ${peek}))`;
		case 'bottom':
		default:
			return `translateY(calc(100% - ${peek}))`;
	}
}

function visibleShellTransform(): string {
	return 'translate(0, 0)';
}

/**
 * @remarks WAAPI slide-in when stealth mode hands control back to the dock.
 */
export function runStealthRevealMotion(shell: HTMLElement, placement: DevToolbarPlacement): Animation | undefined {
	if (prefersReducedMotion()) {
		return;
	}

	cancelElementAnimations(shell);
	setMotionActive(shell, true);

	const animation = shell.animate(
		[
			{ transform: hiddenShellTransform(shell, placement), opacity: 0.55 },
			{ transform: visibleShellTransform(), opacity: 1 },
		],
		{
			duration: 380,
			easing: TOOLBAR_EASE,
			fill: 'both',
		},
	);

	finishMotion(shell, animation);

	const dock = shell.querySelector<HTMLElement>('.eco-dev-toolbar__dock');
	if (dock) {
		runDockRevealMotion(dock);
	}

	return animation;
}

function runDockRevealMotion(dock: HTMLElement): Animation | undefined {
	if (prefersReducedMotion()) {
		return;
	}

	cancelElementAnimations(dock);

	return dock.animate(
		[
			{ transform: 'scale(0.94)', opacity: 0.45 },
			{ transform: 'scale(1)', opacity: 1 },
		],
		{
			duration: 320,
			easing: TOOLBAR_EASE,
			fill: 'both',
		},
	);
}
