import { createContext } from 'react'

/** The id of the placement a widget is drawn for. Widgets that fetch their own data need it. */
export const PlacementIdContext = createContext<string | undefined>(undefined)
