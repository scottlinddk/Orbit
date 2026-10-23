# Changelog

## [Unreleased]

- Prepare native amd64 and arm64 smoke tests and multi-architecture image publishing.
- Run native deployment and upgrade/rollback checks on both architectures for pull requests.
- Validate deployment URL components and support an independent HTTPS clock reference in `orbit doctor`.

Before tagging a release, move its notes into a `## [x.y.z]` section. The release workflow
requires that section and publishes `ghcr.io/scottlinddk/orbit:x.y.z` and `:latest`.
