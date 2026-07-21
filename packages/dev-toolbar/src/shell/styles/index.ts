import { DEV_TOOLBAR_BASE_STYLES } from './base.ts';
import { DEV_TOOLBAR_DOCK_STYLES } from './dock.ts';
import { DEV_TOOLBAR_PANEL_STYLES } from './panel.ts';
import { DEV_TOOLBAR_CONTENT_STYLES } from './content.ts';
import { DEV_TOOLBAR_SETTINGS_STYLES } from './settings.ts';

export const DEV_TOOLBAR_STYLES = [
	DEV_TOOLBAR_BASE_STYLES,
	DEV_TOOLBAR_DOCK_STYLES,
	DEV_TOOLBAR_PANEL_STYLES,
	DEV_TOOLBAR_CONTENT_STYLES,
	DEV_TOOLBAR_SETTINGS_STYLES,
].join('\n');
