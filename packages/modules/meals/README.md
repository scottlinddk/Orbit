# @orbit/module-meals

Built-in meal plan module ([ADR 0021](../../../docs/architecture/adr/0021-meals-and-grocy.md)).

It has one widget, `meals.plan`: the coming days' planned meals from a connected Mealie, with the ingredients and steps of a recipe one click away. Orbit has no meal planner of its own. Plans and recipes are read only and are changed in Mealie.

The widget gets its data through `MealsHostContext`, which the app provides, so the module never touches the API client.

See [architecture overview](../../../docs/architecture/overview.md) for the dependency rules this package must follow.
