# Request Pipeline Metrics

This directory owns opt-in counters for page-module loading, MDX transforms, collection builds, and route-render phases.

`createAppRuntime()` creates a fresh metrics state for each app. Build and render instrumentation updates that state, and the response cache coordinator serializes the same app's snapshot into the `x-ecopages-pipeline-metrics` header when metrics are enabled. Two apps in one process therefore report independent counters.

Set `ECOPAGES_REQUEST_PIPELINE_METRICS=1`, `ECOPAGES_ROLLDOWN_BUILD_METRICS=1`, or `ECOPAGES_LOGGER_DEBUG=true` to enable request-pipeline metrics. With all three unset, record functions return without updating counters.
