import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { X } from './icons';

export type AnnouncementBarProps = {
	onClose: () => void;
	children?: ReactNode;
	slideDown?: boolean;
};

export const AnnouncementBar = eco.component<AnnouncementBarProps, ReactNode>({
	dependencies: {
		stylesheets: ['./announcement-bar.css'],
		components: [X],
	},
	render: ({ onClose, slideDown = false }) => {
		return (
			<div
				className={slideDown ? 'announcement-bar announcement-bar--slide-down' : 'announcement-bar'}
				role="alert"
			>
				<div className="announcement-bar__content">
					<span className="announcement-bar__badge">New</span>
					<span className="announcement-bar__text">
						Check out our new{' '}
						<a href="/skills" className="announcement-bar__link">
							Skills Guide
						</a>{' '}
						to master Ecopages!
					</span>
				</div>
				<button onClick={onClose} className="announcement-bar__close" aria-label="Close announcement">
					<X size={16} />
				</button>
			</div>
		);
	},
});
