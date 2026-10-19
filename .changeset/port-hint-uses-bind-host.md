---
'@ecopages/core': patch
---

The "next free" port suggested when the preferred port is in use now checks the address the app binds, instead of always checking `127.0.0.1`. The check resolves the configured hostname to a single address first, so a port taken on that address is no longer reported as free.
