const lazySentinel = document.createElement('div');
lazySentinel.id = 'lazy-script-loaded';
lazySentinel.textContent = 'Lazy script loaded!';
document.body.appendChild(lazySentinel);
