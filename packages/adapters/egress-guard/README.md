# @orbit/adapter-egress-guard

Implements the `EgressFetcher` port (ADR 0003). One place decides what an Orbit server may fetch on a user's behalf.

- Only `http` and `https`, and no credentials in the URL.
- DNS is resolved once and the connection is pinned to that address, so a name cannot change its answer between the check and the connect (DNS rebinding).
- Loopback, private, link-local (which includes the cloud metadata address), carrier-grade NAT, multicast and reserved ranges are refused, for IPv4, IPv6 and IPv4-mapped IPv6. A hostname can be allowed for the LAN through `allowPrivateHosts`, one host at a time.
- Redirects are followed by hand, at most 3, and every hop is checked again.
- Size and time caps. No cookies are sent or stored.
