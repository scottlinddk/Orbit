# Security policy

Orbit will store calendars, household routines and credentials for third-party services, so security reports are taken seriously.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting for this repository ("Security" tab, "Report a vulnerability").

Include what you found, how to reproduce it, and the version or commit. Expect an acknowledgement within a few days. Orbit is pre-MVP and maintained by a small team, so there is no formal SLA yet.

## Scope

In scope: authorization bypass between households, credential exposure, injection, SSRF through integrations, session handling.

Third-party modules installed by an administrator run with the application's privileges. See the trust model in [principles and scope](docs/product/principles-and-scope.md).
