import styles from './ThemePreview.module.css'

/**
 * A sample made of the same variables the app uses, so what shows here is what the app shows.
 * It is decoration for sighted people and carries no information, so it is hidden from assistive technology.
 */
export function ThemePreview() {
  return (
    <div className={styles.preview} aria-hidden="true">
      <div className={styles.hero}>
        <span className={styles.heroTitle}>Overview</span>
        <span className={styles.amount}>$1,842.56</span>
        <span className={styles.chip}>2.46% this month</span>
      </div>
      <div className={styles.card}>
        <span className={styles.cardTitle}>Groceries</span>
        <span className={styles.cardAmount}>$604.36</span>
        <span className={styles.muted}>Secondary text sits here</span>
        <span className={styles.row}>
          <span className={styles.primary}>Primary</span>
          <span className={styles.secondary}>Secondary</span>
          <span className={styles.field}>Field</span>
        </span>
      </div>
    </div>
  )
}
