import Alpine, { type AlpineComponent } from 'alpinejs';

export function register<T = unknown>(name: string, callback: () => AlpineComponent<T>): void {
	document.addEventListener('alpine:init', () => {
		Alpine.data(name, callback);
	});

	if (window.Alpine === undefined) {
		window.Alpine = Alpine;
		window.Alpine.start();
	}
}
