import { ApiError } from '../api/client.ts'
import { Alert } from './Alert.tsx'
import { Button } from './Button.tsx'
import styles from './QueryError.module.css'

interface Props {
  error: unknown
  onRetry?: () => void
}

/** A missing resource and a foreign one look the same by design, so say both. */
export function QueryError({ error, onRetry }: Props) {
  const notFound = error instanceof ApiError && error.status === 404
  const message = notFound
    ? 'Not found, or you do not have access to it.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong.'
  return (
    <div className={styles.error}>
      <Alert>{message}</Alert>
      {onRetry && !notFound ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  )
}
