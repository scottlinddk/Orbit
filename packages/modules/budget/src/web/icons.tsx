import type { SVGProps } from 'react'
import type { CategoryIcon } from './sampleData.ts'

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

/** Arrow that points up and right for `up`, down and right otherwise. */
export function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg {...base} width={12} height={12} strokeWidth={2.4}>
      {up ? <path d="M7 17 17 7M8 7h9v9" /> : <path d="M7 7l10 10M17 8v9H8" />}
    </svg>
  )
}

const categoryPaths: Record<CategoryIcon, string> = {
  cart: 'M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.2a1 1 0 0 0 1-.8L19 8H6.2M9.5 19.5h.01M16.5 19.5h.01',
  shirt: 'm8 4-5 3 2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 0 1-8 0Z',
  cup: 'M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9ZM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3',
  heart:
    'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10ZM8 11h2l1.500-2 2 4 1.500-2h1',
  train:
    'M7 4h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2ZM5 11h14M8 21l2-3M16 21l-2-3M9 15h.01M15 15h.01',
  sport: 'm6.5 6.5 11 11M3 10l4-4 3 3-4 4-3-3Zm11 4 4-4 3 3-4 4-3-3Z',
}

export function CategoryGlyph({ name }: { name: CategoryIcon }) {
  return (
    <svg {...base}>
      <path d={categoryPaths[name]} />
    </svg>
  )
}
