type WindowWithNavigation = Window & {
	navigation?: EventTarget & { canGoBack: boolean; canGoForward: boolean };
	__electrobunSendToHost?: (message: unknown) => void;
};

const { navigation, __electrobunSendToHost } = window as WindowWithNavigation;
const back = document.querySelector<HTMLButtonElement>('[data-history="back"]');
const forward = document.querySelector<HTMLButtonElement>('[data-history="forward"]');

if (back && forward) {
	const syncHistory = () => {
		back.disabled = navigation?.canGoBack === false;
		forward.disabled = navigation?.canGoForward === false;
	};

	back.addEventListener('click', () => history.back());
	forward.addEventListener('click', () => history.forward());
	navigation?.addEventListener('currententrychange', syncHistory);
	window.addEventListener('pageshow', syncHistory);
	syncHistory();
}

if (__electrobunSendToHost) {
	for (const button of document.querySelectorAll<HTMLButtonElement>('[data-window-action]')) {
		button.addEventListener('click', () => __electrobunSendToHost(`workspace:${button.dataset.windowAction}`));
	}
}
