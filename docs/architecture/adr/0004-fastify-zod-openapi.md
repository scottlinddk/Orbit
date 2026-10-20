# 0004 Fastify, zod and OpenAPI

Status: accepted

## Decision
- Fastify for HTTP, with `fastify-type-provider-zod` for request and response validation.
- Schemas live in `packages/contracts` as zod and are the single source of truth.
- The OpenAPI document is generated from those schemas (`@fastify/swagger`), checked in CI for drift, and used to generate the typed web client.

## Consequences
- Non-TypeScript contributors and tools can use the API.
- Response schemas strip unknown fields, which helps prevent accidental leakage of secrets.
- Error shape is a shared contract (RFC 9457 problem details).
