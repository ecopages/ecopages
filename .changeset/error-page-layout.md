---
'@ecopages/core': patch
---

Fix the layout of the built-in error pages. A page now fills the viewport, so the background gradient no longer repeats into a visible band, and the card no longer grows past a narrow viewport. On the development 500 page, a long unbroken message, such as a module path, wraps inside the card, and the message is shown once: when the stack opens with it, the separate message block is omitted. A message shown apart from the stack gets a monospace alert style, exposed as the `eco-error-page__diagnostic-message` class, and the stack box is capped at 22rem or half the viewport height, whichever is smaller.
