# Diagnostics

**Layer:** Build.

This directory owns opt-in counters for page-module loading, MDX transforms, collection builds, and route-render phases, plus the startup trace.

`createAppRuntime()` creates a fresh metrics state for each app. Build and render instrumentation updates that state, and the response cache coordinator serializes the same app's snapshot into the `x-ecopages-pipeline-metrics` header when metrics are enabled. Two apps in one process therefore report independent counters.

Set `ECOPAGES_REQUEST_PIPELINE_METRICS=1`, `ECOPAGES_ROLLDOWN_BUILD_METRICS=1`, or `ECOPAGES_LOGGER_DEBUG=true` to enable request-pipeline metrics. With all three unset, record functions return without updating counters.

`startup-trace.ts` reports the same build parallelism used by the build queue and static export. The removed `ECOPAGES_DEV_BUILD_PARALLELISM` and `ECOPAGES_DEV_HMR_PARALLELISM` variables did not configure either path.
