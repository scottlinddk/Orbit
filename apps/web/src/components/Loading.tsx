import styles from './Loading.module.css'

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" className={styles.loading}>
      {label}…
    </p>
  )
}
