import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { Alert, Button, Field, Input } from '../components/ui'

const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function friendlyAuthError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message.toLowerCase() : ''
  if (message.includes('invalid login credentials')) {
    return 'The email or password is incorrect.'
  }
  if (message.includes('email not confirmed')) {
    return 'This account is not active yet. Ask the CRM administrator for help.'
  }
  if (message.includes('too many requests') || message.includes('rate limit')) {
    return 'Too many sign-in attempts. Wait a moment and try again.'
  }
  if (message.includes('fetch') || message.includes('network')) {
    return 'The CRM could not reach Supabase. Check your connection and try again.'
  }
  return 'Sign-in could not be completed. Check your details or contact the CRM administrator.'
}

function safeReturnTo(returnTo?: string): string {
  return returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard'
}

export default function LoginPage({ returnTo }: { returnTo?: string }) {
  const { user, signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (user) return <Navigate to={safeReturnTo(returnTo)} replace />

  const submit = handleSubmit(async (values) => {
    setError(null)
    try {
      await signIn(values.email, values.password)
    } catch (caught) {
      setError(friendlyAuthError(caught))
    }
  })

  return (
    <main className="app-ambient grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
      <section className="relative hidden overflow-hidden border-r border-blue-100 bg-blue-50/50 p-12 text-slate-950 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-24 size-96 rounded-full bg-blue-300/35 blur-3xl" />
        <div className="absolute -bottom-28 -left-20 size-80 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-cyan-500 text-sm font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.2)]">
            MP
          </div>
          <div>
            <p className="text-sm font-bold">MyPath</p>
            <p className="text-[11px] text-slate-500">B2B CRM</p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">
            One shared revenue workspace
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-[1.12] tracking-tight">
            Move every promising conversation forward.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-600">
            Keep company context, qualification, notes, pipeline progress, and monthly
            targets in one focused place.
          </p>
        </div>
        <p className="relative text-[11px] text-slate-500">Internal workspace · MyPath</p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-7 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
          <div className="mb-6 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-cyan-500 text-sm font-black text-white">
              MP
            </div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
            Welcome back
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Sign in to MyPath CRM
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Use the email and password set up by your Supabase administrator.
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Field label="Email" error={errors.email?.message} required>
              <Input type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field label="Password" error={errors.password?.message} required>
              <Input
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
            </Field>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>
          <p className="mt-5 text-center text-[10px] leading-4 text-slate-400">
            No public sign-up or password recovery is available.
          </p>
        </div>
      </section>
    </main>
  )
}
