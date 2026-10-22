# Planets

A planet adds a widget to Orbit without a code release. It is data, not a program: a manifest, a template and, if it needs them, a list of hosts to fetch from. Orbit runs no code from a planet ([ADR 0017](../architecture/adr/0017-planets-declarative-plugins.md)). The threat model is in [`security-model.md`](../architecture/security-model.md).

Only an administrator can install one, from a folder on the server. There is no marketplace, no upload and no automatic update.

## Install and remove

Run these where the database is. In Docker, copy the folder into the data volume first, because the rest of the container is read only:

```sh
docker compose cp ./my-planet orbit:/data/incoming/my-planet
docker compose exec orbit orbit planet install /data/incoming/my-planet
docker compose restart orbit
```

Without Docker: `node apps/api/src/cli.ts planet install ./my-planet`.

| Command                                          | What it does                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `orbit planet install <folder> [--yes]`          | Validates the folder, lists **every** permission, asks, copies the files and pins them.        |
| `orbit planet list`                              | Installed planets. A planet that no longer matches its pin is marked `NOT LOADED`.             |
| `orbit planet secret set <id> <name>`            | Stores a secret the planet declared. Reads the value hidden from the terminal, or from a pipe. |
| `orbit planet webhook <id> <widget-id> <source>` | Makes the webhook URL of a `webhook` source. Shown once.                                       |
| `orbit planet uninstall <id>`                    | Removes the files, stored data, webhook tokens, secrets and scheduled jobs of the planet.      |

Installing copies the files to `<data folder>/planets/installed/<id>/`, so editing the source folder later changes nothing until you install again. `planets.lock` records each planet's version and a SHA-256 digest of all its files. At start, Orbit compares the installed files with that digest and **refuses to load** a planet that differs. It logs why, and `orbit planet list` shows it. Reinstall from a source you trust to fix it.

Installing needs Orbit to be restarted to load the planet. Updating asks again, and says when the permissions changed. Widgets of an uninstalled planet stay on their dashboards and show "Unknown widget" until an owner removes them.

Secrets need `ORBIT_SECRET_KEY` (at least 32 characters, `openssl rand -base64 32`). Back it up separately from the database: without it, stored secrets cannot be read. Secrets are encrypted at rest, are never returned by the API, and a planet can only use the names it declared.

## Folder layout

```
my-planet/
  planet.json            the manifest
  templates/main.liquid  the template named by render.template
  examples/data.json     optional: sample data for tests
  README.md
```

Only `.json`, `.liquid`, `.md` and `.txt` files are accepted, at most 100 files and 256 KB each. Symbolic links are refused. A `.js` or `.wasm` file is an error, because a planet cannot carry code.

## Manifest (`planet.json`, `schema_version` 1)

Unknown keys are errors everywhere, and each error names the field path, for example `data_sources.0.url`.

| Field                        | Meaning                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema_version`             | `1`.                                                                                                                                       |
| `id`                         | Reverse DNS, lower case, at most 56 characters, such as `com.example.weather`. It becomes the widget type `planet.<id>` and never changes. |
| `version`                    | SemVer.                                                                                                                                    |
| `name`, `authors`, `license` | Shown at install. `license` is an SPDX id.                                                                                                 |
| `orbit`                      | SemVer range of Orbit versions it works with, such as `>=0.1.0 <1.0.0`. Install and load refuse a mismatch.                                |
| `permissions`                | Everything the planet may do. Anything not declared is denied. See below.                                                                  |
| `config_schema`              | The settings form, in the same shapes as widget options: `select`, `number`, `toggle`, `text`, each with `key`, `label`, `default`.        |
| `data_sources`               | Where data comes from. See below.                                                                                                          |
| `refresh`                    | `interval_seconds` (default 900), `min_interval_seconds` (default 300, a floor), `jitter_percent` (default 10), `backoff_max_seconds`.     |
| `render`                     | `title`, `description`, `default_span` (1 to 4) and `template` (`templates/<name>.liquid`).                                                |

### Permissions

| Permission   | Effect                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `network`    | `[{ "host": "api.example.com" }]`. The only hosts the planet may contact, GET only. `*.example.com` matches subdomains. |
| `secrets`    | Names the planet may use in request headers as `{secret.name}`.                                                         |
| `storage`    | Keep the last good data and webhook payloads in the database. Without it, data lives in memory and is lost on restart.  |
| `lan`        | May reach hosts on the local network, but only those you also list in `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`.               |
| `raw_output` | May output markup without escaping (the `raw` filter). Avoid it.                                                        |

The install prompt prints one line per capability. Read it: approving a broad `network` entry or `lan` is the main way an administrator can weaken the model.

### Data sources

Every source has an `id`. The template reads its value as `data.<id>`.

| `type`      | Fields                                                                                   | Notes                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static`    | `data`                                                                                   | Any JSON. No network.                                                                                                                                                                  |
| `http_poll` | `url`, `headers`, `parse` (`json` or `text`), `max_bytes` (up to 1 MiB, default 256 KiB) | The URL starts with a host written out in full and listed in `permissions.network`. Path and query may use `{config.key}`, which is URL-encoded.                                       |
| `ical`      | `url`, `headers`, `days_ahead`, `max_events`                                             | Read through the same ICS parser as the calendar integration. Events: `id`, `title`, `allDay`, `start` and `end`, or `startDate` and `endDate`, `location`.                            |
| `webhook`   | `max_bytes` (up to 1 MiB, default 64 KiB), `hmac_secret` (optional secret name)          | Needs `storage`. The sender posts JSON to the URL from `orbit planet webhook`. With `hmac_secret`, deliveries need `x-orbit-signature: sha256=<hex>`, the HMAC-SHA256 of the raw body. |

Header values may use `{secret.name}` and `{config.key}`. Secrets are refused in URLs, because URLs end up in logs.

### Templates

Templates use [Liquid](https://shopify.github.io/liquid/) through LiquidJS. The context is `config` (the settings, with defaults for anything invalid), `data`, `now` (ISO time) and `planet` (`id`, `name`, `version`). **Secrets are never in the context.**

Output is HTML-escaped. `include`, `render`, `layout` and `block` are disabled, the template cannot read files, and rendering is limited to 200 ms, 16 MB and 64 KB of output. A template error shows a message in the widget, never a stack trace.

The output is shown in a sandboxed frame with scripts, forms and the page's origin all blocked, and the page's content security policy stays in force inside it. Inline styles are therefore dropped: use plain markup. Links open in a new tab.

## How data is fetched

- A widget renders from the **last good data** and never waits for the network, except the very first time.
- Refreshes run in the background through the job scheduler, no sooner than `min_interval_seconds`, with jitter. After a failure the wait doubles up to `backoff_max_seconds`. The widget keeps the old data, says it is older, and recovers on the next success.
- Requests use the shared egress guard: DNS is resolved once and the checked address is used, every redirect is checked again, private, loopback and link-local addresses are refused unless you allowed that host and the planet declared `lan`, responses are size and time limited (10 seconds), and cookies are never sent. Request headers are not forwarded to another origin after a redirect.
- If a response contains a secret's value, it is replaced with `[redacted]` before anything is stored or rendered.

## Authoring

`packages/modules/planets/fixtures/hello` is the smallest working planet and the example to copy. Its `examples/data.json` holds sample settings and the output to expect, and the module's tests render it.

Known limits: `http_poll` is GET only, there is no OAuth, and a planet cannot read another planet's data. Distribution (an index, signing, forks) is deferred: see the Planet index issue and [ADR 0017](../architecture/adr/0017-planets-declarative-plugins.md).
