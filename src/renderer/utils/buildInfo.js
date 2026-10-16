// Version and commit of this build, injected by Vite at build time
// (see src/buildInfo.mjs). Never hard-code the version anywhere else.
/* global __APP_VERSION__, __APP_COMMIT__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown';

// "v2.0.0 · 18c12a7"
export const BUILD_LABEL = `v${APP_VERSION} · ${APP_COMMIT}`;
