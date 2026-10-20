import { Navigate, Outlet, useLocation } from 'react-router'
import { useMe } from '../api/auth.ts'
import { Loading } from '../components/Loading.tsx'
import { QueryError } from '../components/QueryError.tsx'

export function RequireAuth() {
  const me = useMe()
  const location = useLocation()
  if (me.isPending) return <Loading />
  if (me.isError) return <QueryError error={me.error} onRetry={() => void me.refetch()} />
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
