# Deployment and upgrade verification

The Docker jobs in CI exercise both native amd64 and arm64. Each runs `deploy/smoke-test.sh`
and `deploy/upgrade-test.sh`. The release workflow requires both architectures to pass before
publishing the multi-architecture image.

## Upgrade and rollback drill

From a full checkout, run:

```sh
deploy/upgrade-test.sh
```

The script builds the previous reachable `v[0-9]*` tag and the current checkout. Until the first
release tag exists, it uses `90e511ecbaa3aef22321022a0503f5b2f63bd657`, the last main revision
before migrations 6–11. This is a pre-release compatibility baseline, not a published release.
Override it with `ORBIT_UPGRADE_FROM=<git-ref>` to test a particular upgrade. CI checks out full
history so both tags and the baseline are available.

The drill creates a separate Compose project and volume, seeds a user, household, dashboard,
invitation and feed on the old version, then reuses that volume with the candidate image.
Password sign-in and the original feed and invitation tokens must still work. If migrations
ran, the automatic pre-migration snapshot must contain the old schema, and the old image must
refuse to start against the upgraded database. Finally the drill restores that snapshot and
checks the original data and tokens on the old image again. Without a schema change it uses
the manual pre-upgrade backup for the rollback drill.

The default loopback port is 3066; set `ORBIT_UPGRADE_PORT` if it is already in use. Set
`ORBIT_UPGRADE_TO_IMAGE` to reuse an existing candidate image, as CI does after the smoke test.
Only the drill's project, volume, temporary files and images it builds are removed at exit.

## Checks that still require real equipment

An arm64 CI runner verifies the architecture but cannot measure a Raspberry Pi's storage,
network or installation time. Public reachability and certificate issuance also need an actual
public hostname. Keep [#48](https://github.com/scottlinddk/Orbit/issues/48) open until these have
been measured; the upgrade drill and CI results alone do not satisfy them.

For each of a Raspberry Pi 5 with a 64-bit OS and an x86 VM:

1. Record the model, CPU/RAM, storage, OS, Docker/Compose versions and tested commit or image tag.
2. Follow [deployment](deployment.md) from the documented starting point. Record the start time,
   the first working dashboard time and elapsed minutes; the target is under ten minutes. State
   whether Docker installation and a source build were included.
3. Run `orbit config validate`, `orbit config print --redacted` and `orbit doctor` in the container.
   Compare the host clock to an independent HTTPS Date source with `doctor --clock-url` or check
   its time synchronization service. Do not post secret values with the results.
4. For a feed install, follow the Caddy override, confirm a publicly trusted certificate, and
   fetch `/api/v1/health` over HTTPS from a machine outside the installation's network. Then
   verify a feed request with a token; keep the token out of the issue report.
5. Record the result and date on #48. A failed check needs its observed error and environment,
   rather than a checked box without evidence.
