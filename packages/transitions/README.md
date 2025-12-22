# @ecopages/transitions

Client-side navigation and view transitions for Ecopages. Intercepts same-origin link clicks to provide smooth page transitions without full page reloads.

## Features

- 🚀 **Client-side navigation** — Intercepts `<a>` clicks for fast navigation
- 🔄 **Smart DOM swapping** — Preserves stylesheets/scripts, replaces content
- 💾 **State persistence** — Keep elements across navigations with `data-eco-persist`
- 📡 **Lifecycle events** — Hook into navigation with custom events

## Installation

```bash
bun add @ecopages/transitions
```

## Usage

Add the `ClientRouter` script to your HTML template or layout:

```tsx
import { ClientRouter } from '@ecopages/transitions';

// In your HtmlTemplate or layout head
<ClientRouter />;
```

## Persistence

Mark elements to preserve across navigations:

```tsx
<nav data-eco-persist="main-nav">{/* Navigation stays intact during page transitions */}</nav>
```

## Force Full Reload

Use `data-eco-reload` to force a full page reload:

```tsx
<a href="/logout" data-eco-reload>
	Logout
</a>
```
