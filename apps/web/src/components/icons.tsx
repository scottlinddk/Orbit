import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

export const GripIcon = () => (
  <svg {...base}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={3} />
  </svg>
)

export const SlidersIcon = () => (
  <svg {...base}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
  </svg>
)

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const PencilIcon = () => (
  <svg {...base}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />
  </svg>
)

export const CheckIcon = () => (
  <svg {...base}>
    <path d="m5 12 5 5 9-10" />
  </svg>
)

export const ResizeIcon = () => (
  <svg {...base} width={14} height={14}>
    <path d="M9 5v14M15 5v14" />
  </svg>
)
