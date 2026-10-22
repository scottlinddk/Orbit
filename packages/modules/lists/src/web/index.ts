import { shoppingWidget } from './ShoppingWidget.tsx'

export {
  ListsHostContext,
  type CreateListView,
  type ListItemView,
  type ListsHost,
  type ListsView,
  type ListSummaryView,
  type ListView,
} from './host.ts'

export const widgets = [shoppingWidget]
