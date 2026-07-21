import { DEV_TOOLBAR_STEALTH_DWELL_MS, DEV_TOOLBAR_STEALTH_FADE_MS } from '../runtime/constants.ts';
import type { DevToolbarPlacement } from '../runtime/preferences.ts';
import { runStealthRevealMotion } from './motion.ts';

export type StealthPhase = 'hidden' | 'dwell' | 'fade' | 'visible';

/**
 * Runs `callback` after Radiant has flushed DOM updates and the browser has painted layout.
 *
 * @remarks Uses a microtask plus two animation frames so WAAPI can start from the stealth peek
 * transform without fighting the shell's CSS transition or reading stale computed styles.
 */
function afterPaint(callback: () => void): void {
	queueMicrotask(() => {
		requestAnimationFrame(() => {
			requestAnimationFrame(callback);
		});
	});
}

type StealthControllerOptions = {
	onPhaseChange: (phase: StealthPhase) => void;
	isPanelOpen: () => boolean;
	isEnabled: () => boolean;
	getShellElement: () => HTMLElement | null;
	getPlacement: () => DevToolbarPlacement;
};

export class DevToolbarStealthController {
	phase: StealthPhase = 'visible';
	private dwellTimer: ReturnType<typeof setTimeout> | undefined;
	private fadeTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly options: StealthControllerOptions) {}

	setPhase(phase: StealthPhase): void {
		this.phase = phase;
		this.options.onPhaseChange(phase);
	}

	/**
	 * Shows the dock immediately and plays the slide-in motion when leaving stealth `hidden`.
	 *
	 * @remarks Sets `data-motion="active"` before the phase change so CSS transitions stay off while
	 * {@link runStealthRevealMotion} takes over. Motion is deferred via {@link afterPaint}.
	 */
	reveal(): void {
		const shell = this.options.getShellElement();
		const wasHidden = this.options.isEnabled() && this.phase === 'hidden';
		if (wasHidden && shell) {
			shell.dataset.motion = 'active';
		}

		this.clearTimers();
		this.setPhase('visible');

		if (!wasHidden || !shell) {
			return;
		}

		afterPaint(() => {
			const animation = runStealthRevealMotion(shell, this.options.getPlacement());
			if (!animation) {
				delete shell.dataset.motion;
			}
		});
	}

	schedule(): void {
		if (!this.options.isEnabled()) {
			return;
		}

		this.clearTimers();
		this.setPhase('dwell');

		this.dwellTimer = setTimeout(() => {
			this.dwellTimer = undefined;
			if (this.options.isPanelOpen() || !this.options.isEnabled()) {
				return;
			}

			this.setPhase('fade');

			this.fadeTimer = setTimeout(() => {
				this.fadeTimer = undefined;
				if (this.options.isPanelOpen() || !this.options.isEnabled()) {
					return;
				}

				this.setPhase('hidden');
			}, DEV_TOOLBAR_STEALTH_FADE_MS);
		}, DEV_TOOLBAR_STEALTH_DWELL_MS);
	}

	clearTimers(): void {
		if (this.dwellTimer !== undefined) {
			clearTimeout(this.dwellTimer);
			this.dwellTimer = undefined;
		}

		if (this.fadeTimer !== undefined) {
			clearTimeout(this.fadeTimer);
			this.fadeTimer = undefined;
		}
	}
}
