import {
	DEV_TOOLBAR_NAVIGATION_APP_ID,
	DEV_TOOLBAR_NAVIGATION_LOADING_DELAY_MS,
	DEV_TOOLBAR_NAVIGATION_LOADING_TIMEOUT_MS,
} from '../runtime/constants.ts';

type NavigationLoadingOptions = {
	onLoadingChange: (appId: string, loading: boolean) => void;
};

export class DevToolbarNavigationLoading {
	private delayTimer: ReturnType<typeof setTimeout> | undefined;
	private timeoutTimer: ReturnType<typeof setTimeout> | undefined;
	private loading = false;

	constructor(private readonly options: NavigationLoadingOptions) {}

	begin(): void {
		this.clear();

		this.delayTimer = setTimeout(() => {
			this.delayTimer = undefined;
			this.loading = true;
			this.options.onLoadingChange(DEV_TOOLBAR_NAVIGATION_APP_ID, true);
			this.timeoutTimer = setTimeout(() => {
				this.end();
			}, DEV_TOOLBAR_NAVIGATION_LOADING_TIMEOUT_MS);
		}, DEV_TOOLBAR_NAVIGATION_LOADING_DELAY_MS);
	}

	end(): void {
		this.clear();
		if (!this.loading) {
			return;
		}

		this.loading = false;
		this.options.onLoadingChange(DEV_TOOLBAR_NAVIGATION_APP_ID, false);
	}

	clear(): void {
		if (this.delayTimer !== undefined) {
			clearTimeout(this.delayTimer);
			this.delayTimer = undefined;
		}

		if (this.timeoutTimer !== undefined) {
			clearTimeout(this.timeoutTimer);
			this.timeoutTimer = undefined;
		}
	}
}
