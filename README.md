# Orbit

Orbit is an open-source, self-hostable dashboard that brings together the information, tools, and everyday workflows that matter to you and your household, in one customizable place you control.

## Status

Pre-MVP. Accounts, households and dashboards work end to end in the browser. Calendar and list data sources do not exist yet.

```sh
docker compose up -d --build   # then open http://localhost:3000
```

Full guide, HTTPS, backup and restore: [deploying with Docker](docs/operations/deployment.md). For development see [apps/api](apps/api/README.md) and [apps/web](apps/web/README.md). See [docs](docs/README.md) for scope and architecture decisions, and [CONTRIBUTING](CONTRIBUTING.md) to get started.

## License

Orbit is licensed under the [Apache License 2.0](LICENSE).
