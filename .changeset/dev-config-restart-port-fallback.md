---
'@ecopages/core': minor
'@ecopages/ecopages': minor
---

Dev servers use `PortManager` for port collisions, with a Clack confirmation on TTY sessions and safe default-port fallback in non-interactive environments. Adding, changing, or removing `eco.config` and supported `.env` files restarts the supervised `ecopages dev` process and reloads dotenv values.
