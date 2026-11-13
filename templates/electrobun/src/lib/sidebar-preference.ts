export const sidebarCookie = 'workspace-sidebar';

export function sidebarStartsOpen(cookies: string) {
	return !cookies.split(';').some((cookie) => cookie.trim() === `${sidebarCookie}=collapsed`);
}
