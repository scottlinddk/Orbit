import { useMemo } from 'react'
import { usePlanetWidgets } from '../api/planets.ts'
import { planetDefinition } from './planetWidgets.ts'
import { buildRegistry, registry, type WidgetRegistry } from './registry.ts'

/** The built-in widgets plus one per installed Planet. Built-ins win if a type ever collides. */
export function useRegistry(): WidgetRegistry {
  const planets = usePlanetWidgets().data
  return useMemo(() => {
    if (!planets || planets.length === 0) return registry
    const extra = planets.filter((p) => !registry.find(p.type)).map(planetDefinition)
    return buildRegistry([...registry.all, ...extra])
  }, [planets])
}
