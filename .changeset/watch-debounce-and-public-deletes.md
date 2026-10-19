---
'@ecopages/core': patch
---

In development, deleting or renaming a file in the public directory now removes its copy from the served output, so the old file no longer keeps being served. An invalid `ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS` value (not a number, or negative) now logs a warning and uses the default 150 ms window instead of silently disabling debouncing.
