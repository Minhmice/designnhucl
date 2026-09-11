/**
 * Public control-plane API.
 *
 * This module is intentionally additive: importing it does not alter the
 * legacy WebLens CLI or standalone capture behavior.  Applications can opt
 * into durable tenancy, identity/provenance, agent runs, events, and the
 * WebLens evaluation adapter explicitly.
 */
export * from './database.js';
export * from './events.js';
export * from './agents.js';
export * from './identity.js';
export * from './evaluations.js';
