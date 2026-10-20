import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useCreateHousehold } from '../../api/households.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { TextField } from '../../components/TextField.tsx'
import styles from './Household.module.css'

export function CreateHouseholdForm({ heading }: { heading: string }) {
  const [name, setName] = useState('')
  const create = useCreateHousehold()
  const navigate = useNavigate()

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate({ name }, { onSuccess: (household) => void navigate(`/h/${household.id}`) })
  }

  return (
    <form onSubmit={submit} className={`${styles.panel} ${styles.form}`}>
      <h2>{heading}</h2>
      {create.error ? <Alert>{create.error.message}</Alert> : null}
      <TextField
        label="Household name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={80}
        required
        hint="For example “Home” or “The Hansens”."
      />
      <Button type="submit" variant="primary" busy={create.isPending}>
        Create household
      </Button>
    </form>
  )
}
