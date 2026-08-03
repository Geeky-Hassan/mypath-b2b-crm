import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Alert, Button, Card, Field, Input } from '../components/ui'
import { temporaryPasswordSchema } from '../lib/accountValidation'
import { runTeamAdminAction } from '../services/crm'

const passwordChangeSchema = z
  .object({
    password: temporaryPasswordSchema,
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    message: 'Passwords do not match.',
    path: ['confirmation'],
  })

type PasswordChangeValues = z.infer<typeof passwordChangeSchema>

export default function ChangePasswordPage() {
  const { profile, reloadProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { password: '', confirmation: '' },
  })

  return (
    <main className="app-ambient flex min-h-screen items-center justify-center p-5">
      <Card className="w-full max-w-md p-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-cyan-500 text-xs font-black text-white">
          MP
        </div>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
          Account security
        </p>
        <h1 className="mt-2 text-xl font-bold text-slate-950">Change your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Hi {profile?.full_name?.split(' ')[0]}. You can optionally replace your current
          password here. Founder-issued passwords already provide normal CRM access.
        </p>
        {error ? (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
        <form
          className="mt-5 space-y-4"
          onSubmit={handleSubmit(async (values) => {
            setError(null)
            try {
              await runTeamAdminAction({
                action: 'change_own_password',
                password: values.password,
              })
              await reloadProfile()
              navigate('/dashboard', { replace: true })
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : 'Your password could not be changed.',
              )
            }
          })}
        >
          <Field
            label="New password"
            required
            error={errors.password?.message}
            hint="At least 12 characters with upper/lowercase letters, a number, and a symbol."
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
          </Field>
          <Field label="Confirm password" required error={errors.confirmation?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              {...register('confirmation')}
            />
          </Field>
          <Button className="w-full" type="submit" loading={isSubmitting}>
            Save new password
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-xs font-semibold text-slate-500 hover:text-blue-700"
          onClick={() => void signOut()}
        >
          Sign out instead
        </button>
      </Card>
    </main>
  )
}
