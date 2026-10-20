import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

interface Props {
  /** A short line above the title, such as a greeting. */
  eyebrow?: string
  title: string
  /** Buttons on the right of the title. */
  actions?: ReactNode
}

/** The big title row of a page. The title is the page's only h1. */
export function PageHeader({ eyebrow, title, actions }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
}
