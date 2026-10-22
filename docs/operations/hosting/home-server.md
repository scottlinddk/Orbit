# Home server: Raspberry Pi or mini PC with Tailscale

For a household that wants Orbit at home and on the phones of the family away from home, with nothing exposed to the public internet. Typical hardware: a Raspberry Pi 4 or 5 with a 64-bit OS (arm64), a small x86 mini PC, or a NAS that runs Docker.

Status: written from the documentation and the CI smoke tests. It has not yet been followed from scratch on a Raspberry Pi, so the measurements below are blank. When you do it, record the time and the power-cut result here.

## Steps

1. **Install a 64-bit OS** and Docker Engine with the Compose plugin (version 2.19 or later, see [deployment](../deployment.md)).
2. **Install Tailscale** and run `sudo tailscale up`. Enable MagicDNS and HTTPS certificates for the tailnet.
3. **Get Orbit.** The release workflow publishes amd64 and arm64 images to GHCR (see [deployment](../deployment.md) for the pull command). To build on the device instead, clone the repository and run `docker compose up -d --build`. Building on a Raspberry Pi is slow.
4. **Set the address.** In `.env` set `ORBIT_PUBLIC_URL=https://<machine>.<tailnet>.ts.net`.
5. **Start and serve.** `docker compose up -d`, then `sudo tailscale serve --bg 3000`. Details and alternatives: [HTTPS for a home network or a tailnet](https-lan-and-tailscale.md).
6. **Create the owner.** The first account needs the setup code printed in the logs (`docker compose logs orbit`). Then invite family members from the household page ([invitations](../deployment.md#adding-people)).
7. **Copy backups off the device** on a schedule, see below.

## Storage

SQLite writes often. Use an SSD on USB 3 for the Docker data directory rather than an SD card. An SD card works, but it wears out sooner and corrupts more easily after a power cut. If the card is all you have: keep the automatic backups on (the default), copy them off the device daily, and keep a spare card with the OS installed.

## Power loss and start-up

`compose.yaml` uses `restart: unless-stopped`, and Docker starts at boot, so the stack comes back without anyone logging in. SQLite in WAL mode survives a power cut without losing committed data, and Orbit checks integrity on `restore` rather than trusting a file. A UPS is the only real protection for the storage itself.

## Off-device backups

Orbit writes a backup daily to `/data/backups` ([automatic backups](../backup-and-restore.md#automatic-backups)). Those live on the same disk. Pull them to another machine, for example from a cron job on a second computer:

```sh
rsync -a --include='scheduled-*.sqlite' --exclude='*' \
  "$(docker volume inspect -f '{{ .Mountpoint }}' orbit_orbit-data)/backups/" /mnt/nas/orbit-backups/
```

(The volume name depends on the Compose project directory; check `docker volume ls`.) Test a restore once, as described in [backup and restore](../backup-and-restore.md#restore).

## Updating

Take a backup first, then pull and restart. Orbit also snapshots the database before any migration ([details](../backup-and-restore.md#automatic-snapshot-before-an-upgrade)).

```sh
docker compose exec orbit orbit backup /data/backups/before-upgrade.sqlite
docker compose pull && docker compose up -d
```

## Measurements (open)

- [ ] Time from a blank Raspberry Pi 4 to a working dashboard: ______ minutes.
- [ ] After pulling the power and restoring it, the stack is back and the data is intact.
- [ ] Off-device backup tested once, including a restore from the copy.
