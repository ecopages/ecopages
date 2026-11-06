import { useState, type ReactNode } from 'react';
import { X } from './icons';
import './announcement-bar.css';

export type AnnouncementBarProps = {
	children?: ReactNode;
	slideDown?: boolean;
};

const STORAGE_KEY = 'announcement-bar-dismissed';

export function AnnouncementBar({ slideDown = false }: AnnouncementBarProps): ReactNode {
	const [isVisible, setIsVisible] = useState(true);

	const handleClose = () => {
		localStorage.setItem(STORAGE_KEY, 'true');
		document.documentElement.setAttribute('data-announcement-dismissed', 'true');
		setIsVisible(false);
	};

	if (!isVisible) {
		return null;
	}

	return (
		<div className={slideDown ? 'announcement-bar announcement-bar--slide-down' : 'announcement-bar'} role="alert">
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
			<button
				type="button"
				onClick={handleClose}
				className="announcement-bar__close"
				aria-label="Close announcement"
			>
				<X size={16} />
			</button>
		</div>
	);
}
