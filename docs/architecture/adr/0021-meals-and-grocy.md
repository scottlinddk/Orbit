# 0021 Meals from Mealie, and Grocy

Status: accepted

## Context

Issue 19 asked whether Orbit should have a meal planner of its own, or show the plan of a system the household already uses. Issue 17 asked for Mealie and Grocy. Both are self-hosted systems with an address, a token and data Orbit can show, which is what the connection framework of [ADR 0019](0019-connections-and-home-assistant.md) was built for.

## Decisions

1. **No native meal planner.** Meals are a read-only view of Mealie. A planner needs recipes, a weekly plan, scaling, an ingredients-to-shopping flow, an import path and a recipe editor. Mealie already does all of it, and a household that wants meal planning has usually chosen Mealie. A native planner would be a second, smaller product inside Orbit, against principle 2 ("small core, composable modules") and principle 3 ("useful before extensible"). Tandoor is a possible later provider behind the same port. It is not built here.
2. **Two new connection kinds, `mealie` and `grocy`**, each its own package under `packages/integrations/`. They add a kind and an adapter, not a new framework. The `IntegrationProvider` port gains three optional reads: `readMealPlan`, `readRecipe` and `readStock`. A kind implements the reads that match what it discovers.
3. **Two new mirror roles.** `meals` (Mealie's meal plan, one per connection, entity id `mealplan.mealplan`) and `stock` (Grocy's stock overview, `stock.stock`). Shopping lists keep the `todo` role and appear as read-only external lists, exactly like Home Assistant's. The entity id may now contain hyphens, because Mealie's ids are UUIDs.
4. **Mealie, API version.** Orbit reads the Mealie 2 API (`/api/households/...`) and refuses an older Mealie with a clear message. Mealie 1 used `/api/groups/...`. Guessing at both would mean maintaining two adapters for a version that is out of date. Version detection uses `GET /api/app/about`, which needs no login. Release versions such as `v2.8.0` are compared by major number. A build named `nightly` or `develop` is accepted and assumed current.
5. **Grocy, API version.** Orbit is checked against Grocy 4 (the API description of Grocy's public demo reported 4.7.1) and refuses an older Grocy. The credential is sent in the `GROCY-API-KEY` header. Stock comes from `GET /api/stock/volatile` (expired, overdue, due soon and missing products). Shopping lists come from the `shopping_list` and `shopping_lists` objects, with product names joined in from `products`.
6. **Recipes are shown, but only those the plan points to.** `GET /meals/recipes/:connectionId/:ref` answers only for a recipe that appears in a meal plan entry of that connection. Otherwise a household member could read the whole recipe library of Mealie through Orbit, which the owner never chose to share. A recipe is cached for ten minutes, and an old copy is served if a refresh fails.
7. **No recipe images.** Mealie serves images from its own address. Linking to one would reveal the connection's address, which is a secret in Orbit. Images are a separate decision if a household asks for them.
8. **New read actions** `meals:view` and `stock:view`, granted to every role including `device`, like `calendar:view`. Managing a connection stays `connection:manage`, owner only.
9. **Caching and the display feed** follow ADR 0019. Meal plans and stock are read at most every five minutes per connection. A failed refresh keeps the last good copy and says so. The display feed never waits for the other system.
10. **Feed fields** `meals.today` (the slot and title of each meal planned for today, at most 20) and `stock.expiring` (name, status and best-before date, most urgent first, at most 20). Notes, recipes, amounts and ids are not published. "Today" follows `ORBIT_TIME_ZONE`.
11. **Everything is read only.** Writing to Mealie or Grocy (adding a meal, ticking off a shopping item, consuming stock) needs a token with more reach and a conflict story. That is a separate decision.

## Verified against

- **Mealie**: the OpenAPI document of Mealie's public demo (`demo.mealie.io/openapi.json`, version `nightly`), on 2026-10-22: the paths `/api/households/mealplans`, `/api/households/shopping/lists`, `/api/households/shopping/lists/{item_id}`, `/api/recipes/{slug}` and `/api/app/about`, the page envelope (`page`, `per_page`, `total`, `total_pages`, `items`), and the plan entry fields (`id`, `date`, `entryType`, `title`, `text`, `recipeId`, `recipe`).
- **Grocy**: the API description of Grocy's public demo (`demo.grocy.info/api/openapi/specification`, version 4.7.1), on 2026-10-22: the `GROCY-API-KEY` header, `/system/info`, `/stock/volatile` and the objects `shopping_list`, `shopping_lists` and `products`.

Neither system promises these shapes stay the same. Tests use in-process fake servers. Nothing was run against a real Mealie or Grocy, so each guide carries a checklist.

## Consequences

- Two new packages (`@orbit/integration-mealie`, `@orbit/integration-grocy`) and one new module (`@orbit/module-meals`, the `meals.plan` widget), with no new runtime dependency.
- No new table: mirrors are stored on the connection as before.
- `MirrorRole` gains `meals` and `stock`, the connection test reports `mealPlans` and `stockViews`, and the owner's connection page offers Mealie and Grocy.
- Security model row 18 covers the extra exposure (the recipe library, and a second kind of credential).
- Not covered: a stock widget (the API and the feed field exist, a dashboard widget does not), Tandoor, images, writes, Grocy chores and recipes, and Mealie cookbooks and tags.
