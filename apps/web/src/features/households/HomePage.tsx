import { Navigate } from 'react-router'
import { useHouseholds } from '../../api/households.ts'
import { Loading } from '../../components/Loading.tsx'
import { QueryError } from '../../components/QueryError.tsx'
import { CreateHouseholdForm } from './CreateHouseholdForm.tsx'

export function HomePage() {
  const households = useHouseholds()
  if (households.isPending) return <Loading />
  if (households.isError)
    return <QueryError error={households.error} onRetry={() => void households.refetch()} />
  const first = households.data[0]
  if (first) return <Navigate to={`/h/${first.id}`} replace />
  return (
    <>
      <h1>Welcome to Orbit</h1>
      <p>A household is the group that shares dashboards. Create yours to get started.</p>
      <CreateHouseholdForm heading="Create your household" />
    </>
  )
}
