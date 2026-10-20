export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" style={{ color: 'var(--color-text-muted)' }}>
      {label}…
    </p>
  )
}
