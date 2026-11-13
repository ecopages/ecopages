import type { RuiSidebarElement, RuiSidebarToggleDetail } from '@ecopages/radiant-ui/sidebar';
import { sidebarCookie, sidebarStartsOpen } from '../../lib/sidebar-preference';

const sidebar = document.querySelector<RuiSidebarElement>('rui-sidebar#workspace-sidebar');

sidebar?.addEventListener('rui-sidebar-toggle', (event) => {
	if (sidebar.isMobile || !(event instanceof CustomEvent)) return;
	const { state }: RuiSidebarToggleDetail = event.detail;
	document.cookie = `${sidebarCookie}=${state}; Path=/; SameSite=Lax; Max-Age=31536000`;
});

window.addEventListener('pageshow', (event) => {
	if (event.persisted && sidebar && !sidebar.isMobile) {
		sidebar.setOpen(sidebarStartsOpen(document.cookie));
	}
});
