import { definePost } from '@ecopages/core';
import { SESSION_COOKIE } from '../../lib/session.server';

export const POST = definePost({
	handler: ({ response }) =>
		response
			.headers({ 'Set-Cookie': `${SESSION_COOKIE}=demo; Path=/; HttpOnly; SameSite=Lax` })
			.redirect('/dashboard', 303),
});
