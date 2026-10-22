# Grocy

Orbit can show Grocy's shopping lists next to its own and a short list of stock that is expired, due soon or running out. Orbit only reads them. Buying, consuming and editing happen in Grocy. Design notes are in [ADR 0021](../architecture/adr/0021-meals-and-grocy.md).

Status: the adapter is tested against an in-process fake Grocy that follows the API description of Grocy's public demo (version 4.7.1, checked on 2026-10-22). It has not been run against a real Grocy by the maintainers. The checklist at the bottom is open: do it once and report the result.

## What you need

1. **Grocy 4 or newer.** Orbit is checked against Grocy 4 and refuses an older Grocy with a message that says to update first.
2. **`ORBIT_SECRET_KEY`** on the Orbit server (at least 32 characters). The address and the key are stored encrypted, and Orbit refuses to save them without it. Generate one with `openssl rand -base64 32`.
3. **Grocy's address** as you open it in a browser, for example `http://grocy.local:9283`. A path prefix is kept, a trailing slash is dropped.
4. **An API key.** In Grocy open the user menu, then **Manage API keys**, and add one with a description such as `Orbit`. Copy it. The key has the same reach as your Grocy user.
5. **Permission to reach a private address.** Grocy usually sits on your home network, and Orbit refuses private addresses by default. Whoever runs the Orbit server lists the host name, exactly as you will type it, in `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` and restarts Orbit:

   ```sh
   ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS=grocy.local
   ```

   Several hosts are separated by commas. If you skip this step, adding the connection fails with a message that names this setting.

## Connect

1. Sign in as an owner and open the household page, **Connections**.
2. Choose **Grocy** as the system, enter the address and the API key, then **Add connection**. Orbit calls Grocy once to check them and saves nothing if that fails. Neither is shown again.
3. **Choose** what to show: the **Stock overview** and any shopping lists, then **Save**.

Shopping lists appear in the shopping list widget's list choice, marked as kept in another system: items cannot be ticked or added there.

## What is shown

| Grocy           | Orbit                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Shopping lists  | Read-only lists. An item is the product name, or the note when there is no product. More than one: "3 × Screws" |
| Stock           | Products that are expired, past their best-before date, due within 7 days, or below the minimum stock you set   |
| Everything else | Not read (recipes, chores, locations, batteries)                                                                |

There is no stock widget on the dashboard yet. The stock is available at `GET /api/v1/households/{id}/stock` and as the `stock.expiring` field of a display feed: name, status and best-before date of the 20 most urgent items, no amounts or ids.

## Limits and behaviour

- Stock is read at most every five minutes, shopping lists every minute. If Grocy stops answering, Orbit keeps showing the last good copy and says so.
- At most 200 stock items, 1000 items per list, 5 connections per household and 20 mirrors per connection.
- A best-before date of `2999-12-31`, which Grocy uses for "never expires", is not shown.
- Grocy's API description does not list a `done` column on shopping list rows. Orbit reads `done` when it is there and treats a missing value as not done. The checklist asks you to confirm this on a real instance.
- Orbit does not write to Grocy.
- Grocy does not promise these REST responses stay the same. After a Grocy upgrade, use **Test**; if something stops working, open an issue with your Grocy version.

## Security

- The key and address are in the encrypted secret store, scope `connection:<id>`. They are not in any API response, log line, error message or the OpenAPI document (tests: `apps/api/src/kitchen.http.test.ts`, `packages/testing/src/kitchen.test.ts`).
- Only owners can add, test, change or remove a connection. Everyone in the household, including a wall display, can read the mirrored lists and the stock.
- Requests go through the shared egress guard, stay on the host you typed, and carry the key only in the `GROCY-API-KEY` header.
- Anyone who gets the key can act as that Grocy user. If it leaks, delete the key in Grocy and remove the connection in Orbit.

## Checklist for a real instance (open)

- [ ] Add a connection to a real Grocy (note its version here: ______).
- [ ] A wrong key is refused with a clear message. A Grocy older than 4 is refused with the "checked against Grocy 4" message.
- [ ] `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` unset: the error names it. Set: the connection works.
- [ ] A shopping list with a product, a product with an amount above 1, a note only, and a ticked-off row shows correctly. Several shopping lists are told apart.
- [ ] Expired, past best-before, due soon and missing products each show with the right status. "Never expires" products show no date.
- [ ] Stopping Grocy keeps the last good data and reports the failure; starting it again recovers.
- [ ] Removing the connection removes the lists and the stock it showed.
