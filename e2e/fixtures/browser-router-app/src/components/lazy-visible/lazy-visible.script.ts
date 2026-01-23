const lazyVisibleSentinel = document.createElement('div');
lazyVisibleSentinel.id = 'visible-script-loaded';
lazyVisibleSentinel.textContent = 'Visible script loaded!';
document.body.appendChild(lazyVisibleSentinel);
