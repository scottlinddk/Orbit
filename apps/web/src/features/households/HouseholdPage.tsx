import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMe } from '../../api/auth.ts'
import { useCreateDashboard, useDashboards } from '../../api/dashboards.ts'
import { useHousehold } from '../../api/households.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { QueryError } from '../../components/QueryError.tsx'
import { TextField } from '../../components/TextField.tsx'
import { MembersPanel } from './MembersPanel.tsx'

export function HouseholdPage() {
  const { householdId = '' } = useParams()
  const me = useMe()
  const household = useHousehold(householdId)
  const dashboards = useDashboards(householdId)
  const create = useCreateDashboard(householdId)
  const navigate = useNavigate()
  const [name, setName] = useState('')

  if (household.isPending) return <Loading />
  if (household.isError)
    return <QueryError error={household.error} onRetry={() => void household.refetch()} />

  const meId = me.data?.id ?? ''
  const isOwner = household.data.members.some((m) => m.userId === meId && m.role === 'owner')

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate({ name }, { onSuccess: (d) => void navigate(`/d/${d.id}`) })
  }

  return (
    <>
      <h1>{household.data.name}</h1>
      <section aria-labelledby="dashboards-heading">
        <h2 id="dashboards-heading">Dashboards</h2>
        {dashboards.isPending ? <Loading /> : null}
        {dashboards.isError ? (
          <QueryError error={dashboards.error} onRetry={() => void dashboards.refetch()} />
        ) : null}
        {dashboards.data?.length === 0 ? (
          <p>
            {isOwner
              ? 'No dashboards yet. Create the first one below.'
              : 'No dashboards yet. An owner can create one.'}
          </p>
        ) : null}
        <ul style={{ paddingLeft: 'var(--space-6)' }}>
          {dashboards.data?.map((d) => (
            <li key={d.id}>
              <Link to={`/d/${d.id}`}>{d.name}</Link> ({d.widgets.length}{' '}
              {d.widgets.length === 1 ? 'widget' : 'widgets'})
            </li>
          ))}
        </ul>
        {isOwner ? (
          <form
            onSubmit={submit}
            style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '26rem' }}
          >
            {create.error ? <Alert>{create.error.message}</Alert> : null}
            <TextField
              label="New dashboard name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
            <Button type="submit" variant="primary" busy={create.isPending}>
              Create dashboard
            </Button>
          </form>
        ) : null}
      </section>
      <MembersPanel household={household.data} meId={meId} isOwner={isOwner} />
    </>
  )
}
