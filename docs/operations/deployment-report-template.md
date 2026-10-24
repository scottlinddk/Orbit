# Deployment measurement report (template)

Copy this into a comment on [#48](https://github.com/scottlinddk/Orbit/issues/48), one report
per machine. The procedure is in [deployment verification](deployment-verification.md). Leave a
field as `not measured` rather than guessing. Never paste secret values, setup tokens or feed
tokens.

## Environment

| Field                      | Value                                           |
| -------------------------- | ----------------------------------------------- |
| Machine                    | Raspberry Pi 5 / x86 VM (model, hypervisor)     |
| CPU / RAM                  |                                                 |
| Storage                    | SD card / SSD / virtual disk (model, size)      |
| OS and architecture        | (for example Raspberry Pi OS 64-bit, `aarch64`) |
| Docker / Compose versions  |                                                 |
| Tested commit or image tag |                                                 |
| Network                    | (wired/Wi-Fi, approximate bandwidth)            |
| Date                       |                                                 |

## Installation time

Start from the documented starting point in [deployment](deployment.md).

| Step                                   | Time (hh:mm) |
| -------------------------------------- | ------------ |
| Start                                  |              |
| First working dashboard                |              |
| **Elapsed minutes** (target: under 10) |              |

- Docker installation included in the elapsed time: yes / no
- Image pulled or built from source: pulled / built
- Anything that slowed or blocked the install:

## Operator checks

Run inside the container. Paste the output with secrets redacted.

- [ ] `orbit config validate`: result
- [ ] `orbit config print --redacted`: confirm no secret value appears
- [ ] `orbit doctor --clock-url <https-origin>`: clock skew reported
- [ ] Time synchronization service active on the host: yes / no

## Public HTTPS (feed installs only)

| Check                                                                             | Result      |
| --------------------------------------------------------------------------------- | ----------- |
| Hostname (a real domain, or `redacted`)                                           |             |
| Caddy override used as documented                                                 | yes / no    |
| Certificate is publicly trusted (issuer name)                                     |             |
| Issuance time from first start to valid certificate                               |             |
| `GET /api/v1/health` over HTTPS from a machine outside the installation's network | status code |
| Authenticated feed request returns data (token not shown)                         | status code |
| Feed request without a token is refused                                           | status code |

## Verdict

- [ ] Meets the target and every check above passed
- [ ] Does not meet the target or a check failed

For each failure: the command, the observed error, and the environment details above. A checked
box without evidence does not close the item.
