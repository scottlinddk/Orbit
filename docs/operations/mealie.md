# Mealie

Orbit can show the week's meal plan from Mealie, with the ingredients and steps of each recipe one click away, and Mealie's shopping lists next to its own. Orbit only reads them. Planning a meal or editing a recipe happens in Mealie. There is no meal planner in Orbit on purpose: see [ADR 0021](../architecture/adr/0021-meals-and-grocy.md).

Status: the adapter is tested against an in-process fake Mealie that follows the OpenAPI document of Mealie's public demo (version `nightly`, checked on 2026-10-22). It has not been run against a real Mealie by the maintainers. The checklist at the bottom is open: do it once and report the result.

## What you need

1. **Mealie 2 or newer.** Mealie 1 keeps meal plans and shopping lists under other paths, and Orbit refuses it with a message that says to update first.
2. **`ORBIT_SECRET_KEY`** on the Orbit server (at least 32 characters). The address and the token are stored encrypted, and Orbit refuses to save them without it. Generate one with `openssl rand -base64 32`.
3. **Mealie's address** as you open it in a browser, for example `http://mealie.local:9000`. A path prefix is kept, a trailing slash is dropped.
4. **An API token.** In Mealie open your user profile, then **API Tokens**, create one named `Orbit` and copy it at once: Mealie shows it only once. It has the same reach as your Mealie user.
5. **Permission to reach a private address.** Mealie usually sits on your home network, and Orbit refuses private addresses by default. Whoever runs the Orbit server lists the host name, exactly as you will type it, in `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` and restarts Orbit:

   ```sh
   ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS=mealie.local
   ```

   Several hosts are separated by commas. If you skip this step, adding the connection fails with a message that names this setting.

## Connect

1. Sign in as an owner and open the household page, **Connections**.
2. Choose **Mealie** as the system, enter the address and the API token, then **Add connection**. Orbit calls Mealie once to check them and saves nothing if that fails. Neither is shown again.
3. **Choose** what to show: the **Meal plan** and any shopping lists, then **Save**.
4. On a dashboard, add the **Meal plan** widget (Edit layout, then add a widget). Its setting is how many days to show, from today.

## What is shown

| Mealie        | Orbit                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Meal plan     | Entries by day and slot (breakfast, lunch, dinner, side, snack, drink, dessert) with notes |
| Recipes       | Name, description, servings, ingredients and steps, for recipes the plan points to         |
| Shopping list | A read-only list: item text as Mealie formats it ("2 kg flour"), ticked or not             |
| Images, tags  | Not shown                                                                                  |

Only recipes that appear in the meal plan can be opened in Orbit, so household members cannot browse your whole recipe library through it. Recipe images are left out because their address would reveal where Mealie runs.

## Limits and behaviour

- The meal plan is read at most every five minutes, shopping lists every minute, a recipe every ten. If Mealie stops answering, Orbit keeps showing the last good copy and says so ("could not be refreshed").
- A range is at most 31 days. Up to 300 entries are read. At most 5 connections per household, 20 mirrors per connection and 1000 items per list.
- The display feed ([TRMNL feed](trmnl-feed.md)) can publish `meals.today`: the slot and title of each meal planned for today, at most 20, no notes or recipes. It uses the cache and never waits for Mealie.
- Orbit does not write to Mealie. Ticking an item off a Mealie shopping list in Orbit answers "read only".
- Mealie does not promise these REST responses stay the same. After a Mealie upgrade, use **Test**; if something stops working, open an issue with your Mealie version.

## Security

- The token and address are in the encrypted secret store, scope `connection:<id>`. They are not in any API response, log line, error message or the OpenAPI document (tests: `apps/api/src/kitchen.http.test.ts`, `packages/testing/src/kitchen.test.ts`).
- Only owners can add, test, change or remove a connection. Everyone in the household, including a wall display, can read the plan and the recipes it points to.
- Requests go through the shared egress guard, stay on the host you typed, and carry the token only in the `Authorization` header.
- Anyone who gets the token can act as that Mealie user. If it leaks, delete the token in Mealie and remove the connection in Orbit.

## Checklist for a real instance (open)

- [ ] Add a connection to a real Mealie (note its version here: ______).
- [ ] A wrong token is refused with a clear message. A Mealie 1 is refused with the "older than version 2" message.
- [ ] `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` unset: the error names it. Set: the connection works.
- [ ] The plan shows entries with a recipe, with free text only, and with a note. A slot Mealie has but Orbit does not know shows as dinner.
- [ ] A recipe opens with the right ingredients and steps. A recipe with no steps opens without a "Steps" section.
- [ ] A shopping list shows its items, ticked items included. The list's name is right.
- [ ] Stopping Mealie keeps the last good data and reports the failure; starting it again recovers.
- [ ] Removing the connection removes the plan and the lists it showed.
