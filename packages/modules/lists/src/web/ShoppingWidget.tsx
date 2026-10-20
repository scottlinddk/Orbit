import { defineWidget } from '@orbit/widget-sdk'

function Shopping() {
  return <p style={{ margin: 0 }}>Shared shopping lists are not available yet.</p>
}

export const shoppingWidget = defineWidget({
  type: 'lists.shopping',
  title: 'Shopping list',
  description: 'A list the whole household can see.',
  defaultSpan: 1,
  status: 'preview',
  Component: Shopping,
})
