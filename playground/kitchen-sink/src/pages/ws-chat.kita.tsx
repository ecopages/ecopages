import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { CHAT_MESSAGES } from '@/handlers/ws-chat-room';
import { getPageTestId } from '@/data/primary-links';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
		scripts: [
			{
				src: './ws-chat.script.ts',
				attributes: {
					'data-eco-rerun': 'true',
				},
			},
		],
		stylesheets: ['./ws-chat.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'WS Chat lab',
		description: 'Ephemeral mini-chat demonstrating WebSocket injection via app.websocket().',
	}),
	render: () => {
		const seedMessages = CHAT_MESSAGES;

		return (
			<div class="chat-lab" data-testid={getPageTestId('/ws-chat')}>
				<section class="chat-lab__intro">
					<p class="chat-lab__eyebrow">WebSocket injection</p>
					<h1 class="chat-lab__title">Mini Chat — app.websocket() surface test</h1>
					<p class="chat-lab__summary">
						This page opens a real WebSocket connection to <code>/ws/chat/lobby</code>. The server handler
						is registered with <code>app.websocket('/ws/chat/:roomId', handler)</code> in{' '}
						<code>app.ts</code>
						and works on both Bun and Node without any runtime-specific imports in app code.
					</p>
					<ul class="chat-lab__facts">
						<li>
							<span class="chat-lab__fact-path">/ws/chat/:roomId</span> is a single registration that
							matches every room id — <code>:roomId</code> arrives in <code>params</code>.
						</li>
						<li>Messages are stored per room in an in-memory map (no DB).</li>
						<li>Open a second tab and send a message — both tabs receive the broadcast in real time.</li>
					</ul>
				</section>

				<section class="chat-lab__workspace">
					<div class="chat-lab__sidebar">
						<p class="chat-lab__panel-label">Connection</p>
						<div class="chat-lab__status-row">
							<span class="chat-lab__status-dot" data-chat-status-dot />
							<span class="chat-lab__status-text" data-chat-status>
								Connecting…
							</span>
						</div>
						<p class="chat-lab__panel-label" style="margin-top:1.5rem">
							Your username
						</p>
						<input
							id="chat-username"
							class="chat-lab__input"
							type="text"
							placeholder="anonymous"
							maxlength={32}
							data-chat-username
						/>
					</div>

					<div class="chat-lab__main">
						<div
							class="chat-lab__messages"
							data-chat-messages
							aria-live="polite"
							aria-label="Chat messages"
						>
							{seedMessages.map((m) => (
								<div class="chat-lab__message" data-message-id={m.id}>
									<span class="chat-lab__message-user">{m.username}</span>
									<span class="chat-lab__message-text">{m.text}</span>
								</div>
							))}
						</div>

						<form class="chat-lab__compose" data-chat-form>
							<input
								id="chat-input"
								class="chat-lab__input chat-lab__input--grow"
								type="text"
								placeholder="Type a message…"
								maxlength={280}
								autocomplete="off"
								data-chat-input
							/>
							<button id="chat-send" type="button" class="chat-lab__send-btn" data-chat-send>
								Send
							</button>
						</form>
					</div>
				</section>
			</div>
		);
	},
});
