import { defineWidget, resolveOptions, type WidgetProps } from '@orbit/widget-sdk'
import { useContext, useState } from 'react'
import { MealsHostContext, type MealView } from './host.ts'
import { addDays, dayLabel, groupByDay, localDay, typeLabel } from './plan.ts'

const MAX_MEALS = 30

const options = [
  {
    key: 'days',
    kind: 'number',
    label: 'Days to show',
    help: 'From today.',
    min: 1,
    max: 14,
    step: 1,
    default: 7,
  },
] as const

function Recipe({ connectionId, recipeRef }: { connectionId: string; recipeRef: string }) {
  const host = useContext(MealsHostContext)
  const recipe = host.useRecipe(connectionId, recipeRef)
  if (recipe.status === 'pending') return <p style={{ margin: 0 }}>Loading the recipe…</p>
  if (recipe.status === 'error')
    return (
      <p role="alert" style={{ margin: 0 }}>
        {recipe.error ?? 'The recipe could not be loaded.'}
      </p>
    )
  if (recipe.status !== 'ready') return null
  return (
    <div style={{ display: 'grid', gap: '0.5rem', margin: '0.25rem 0 0.5rem' }}>
      {recipe.description ? <p style={{ margin: 0 }}>{recipe.description}</p> : null}
      {recipe.servings ? (
        <p style={{ margin: 0, opacity: 0.75 }}>Serves {recipe.servings}</p>
      ) : null}
      <section aria-label="Ingredients">
        <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem' }}>Ingredients</h4>
        {recipe.ingredients.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.75 }}>No ingredients listed.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {recipe.ingredients.map((line, i) => (
              <li key={`${i}:${line}`}>{line}</li>
            ))}
          </ul>
        )}
      </section>
      {recipe.instructions.length > 0 ? (
        <section aria-label="Steps">
          <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem' }}>Steps</h4>
          <ol style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {recipe.instructions.map((line, i) => (
              <li key={`${i}:${line}`}>{line}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

function Meal({ meal }: { meal: MealView }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
        <span style={{ flex: 'none', minWidth: '5rem', opacity: 0.75 }}>
          {typeLabel(meal.type)}
        </span>
        <span>
          {meal.title}
          {meal.note ? <span style={{ opacity: 0.7 }}> · {meal.note}</span> : null}
        </span>
        {meal.recipe ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} the recipe for ${meal.title}`}
            onClick={() => setOpen((value) => !value)}
            style={{ marginLeft: 'auto', flex: 'none' }}
          >
            {open ? 'Hide recipe' : 'Recipe'}
          </button>
        ) : null}
      </div>
      {open && meal.recipe ? (
        <Recipe connectionId={meal.recipe.connectionId} recipeRef={meal.recipe.ref} />
      ) : null}
    </li>
  )
}

function Plan({ config }: WidgetProps) {
  const host = useContext(MealsHostContext)
  const days = Number(resolveOptions(options, config).days)
  const locale = typeof config.locale === 'string' ? config.locale : undefined
  const today = localDay(new Date())
  const plan = host.useMealPlan(today, addDays(today, days - 1))

  if (plan.status === 'unavailable')
    return <p style={{ margin: 0 }}>Meals are not available here.</p>
  if (plan.status === 'pending') return <p style={{ margin: 0 }}>Loading meals…</p>
  if (plan.status === 'error')
    return (
      <p role="alert" style={{ margin: 0 }}>
        The meal plan could not be loaded.
      </p>
    )
  if (plan.status === 'none')
    return (
      <p style={{ margin: 0 }}>
        Connect Mealie to see the week’s meals here. An owner can add it on the household page.
      </p>
    )

  const groups = groupByDay(plan.meals.slice(0, MAX_MEALS))
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {plan.failing.length > 0 ? (
        <p role="status" style={{ margin: 0, opacity: 0.8 }}>
          {plan.failing.join(', ')} could not be refreshed. Showing the last meals we have.
        </p>
      ) : null}
      {groups.length === 0 ? <p style={{ margin: 0 }}>Nothing planned.</p> : null}
      {groups.map((group) => (
        <section key={group.day} aria-label={dayLabel(group.day, today, locale)}>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
            {dayLabel(group.day, today, locale)}
          </h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.25rem' }}>
            {group.meals.map((meal) => (
              <Meal key={meal.id} meal={meal} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export const planWidget = defineWidget({
  type: 'meals.plan',
  title: 'Meal plan',
  description: 'The coming days’ planned meals from Mealie, with the recipe one click away.',
  defaultSpan: 2,
  status: 'stable',
  options,
  Component: Plan,
})
