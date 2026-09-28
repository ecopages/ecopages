export {};

type KitaCounterWindow = Window &
	typeof globalThis & {
		__ecopages_kita_counter_cleanup__?: () => void;
	};

function mountKitaCounters(): () => void {
	const roots = document.querySelectorAll<HTMLElement>('[data-kita-counter]');
	const abortController = new AbortController();

	for (const root of roots) {
		const value = root.querySelector<HTMLElement>('[data-kita-value]');
		const inc = root.querySelector<HTMLButtonElement>('[data-kita-inc]');
		if (!value || !inc) {
			continue;
		}

		inc.addEventListener(
			'click',
			() => {
				const next = Number(value.textContent ?? '0') + 1;
				value.textContent = String(next);
			},
			{ signal: abortController.signal },
		);
	}

	document.addEventListener(
		'eco:before-swap',
		() => {
			abortController.abort();
		},
		{ once: true, signal: abortController.signal },
	);

	return () => {
		abortController.abort();
	};
}

const runtimeWindow = window as KitaCounterWindow;
runtimeWindow.__ecopages_kita_counter_cleanup__?.();
runtimeWindow.__ecopages_kita_counter_cleanup__ = mountKitaCounters();
