import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Textarea,
} from '../components/ui'
import { useToast } from '../components/ui/ToastProvider'
import { useAsyncData } from '../hooks/useAsyncData'
import {
  generateTemporaryPassword,
  leadGeneratorAccountSchema,
  temporaryPasswordSchema,
} from '../lib/accountValidation'
import { formatDateTime } from '../lib/format'
import {
  getProfiles,
  getSettings,
  runTeamAdminAction,
  saveSettings,
  updateProfileWorkDetails,
} from '../services/crm'
import { PIPELINE_STAGES, ROLE_LABELS, STAGE_LABELS, type Profile } from '../types/domain'

const settingsSchema = z.object({
  organization_name: z.string().trim().min(1, 'Organization name is required.'),
  default_currency: z
    .string()
    .trim()
    .length(3, 'Use a three-letter ISO currency code.')
    .regex(/^[A-Za-z]{3}$/, 'Use letters only.'),
})
type SettingsValues = z.infer<typeof settingsSchema>
type AccountValues = z.infer<typeof leadGeneratorAccountSchema>

const workDetailsSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required.').max(120),
  job_title: z.string().trim().max(120).optional(),
  responsibilities: z.string().trim().max(3000).optional(),
})
type WorkDetailsValues = z.infer<typeof workDetailsSchema>

export default function SettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState<'general' | 'users'>('general')
  const [createOpen, setCreateOpen] = useState(false)
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [resetProfile, setResetProfile] = useState<Profile | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{
    fullName: string
    email: string
    password: string
  } | null>(null)
  const [passwordResetComplete, setPasswordResetComplete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [accountBusy, setAccountBusy] = useState<string | null>(null)
  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [settings, profiles] = await Promise.all([getSettings(), getProfiles()])
    return { settings, profiles }
  }, 'settings-and-users')

  if (loading && !data) return <PageLoader label="Loading CRM settings…" />
  if (error || !data || !user)
    return (
      <Alert tone="error" title="Settings could not be loaded">
        {error ?? 'Your session is unavailable.'}
      </Alert>
    )

  const runStatusChange = async (profile: Profile) => {
    const next = profile.account_status === 'active' ? 'disabled' : 'active'
    const verb = next === 'disabled' ? 'disable' : 'reactivate'
    if (
      !window.confirm(
        `${verb[0].toUpperCase() + verb.slice(1)} access for ${profile.full_name}?`,
      )
    )
      return
    setAccountBusy(profile.id)
    setActionError(null)
    try {
      await runTeamAdminAction({
        action: 'set_account_status',
        user_id: profile.id,
        account_status: next,
      })
      toast({ title: `${profile.full_name} is now ${next}.`, tone: 'success' })
      await refresh()
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'Account status could not be changed.',
      )
    } finally {
      setAccountBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Founder controls"
        title="CRM settings"
        description="Manage organization defaults and secure Lead Generator access."
      />
      <div
        className="flex w-fit gap-1 rounded-lg border border-blue-100 bg-white p-1"
        role="tablist"
        aria-label="Settings sections"
      >
        <button
          role="tab"
          aria-selected={tab === 'general'}
          className={`rounded-md px-4 py-2 text-xs font-semibold ${tab === 'general' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-blue-50'}`}
          onClick={() => setTab('general')}
        >
          General
        </button>
        <button
          role="tab"
          aria-selected={tab === 'users'}
          className={`rounded-md px-4 py-2 text-xs font-semibold ${tab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-blue-50'}`}
          onClick={() => setTab('users')}
        >
          Users & access
        </button>
      </div>
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}
      {tab === 'general' ? (
        <GeneralSettings initial={data.settings} userId={user.id} refresh={refresh} />
      ) : (
        <UsersAccess
          profiles={data.profiles}
          busy={accountBusy}
          onCreate={() => {
            setActionError(null)
            setCreatedCredentials(null)
            setCreateOpen(true)
          }}
          onEdit={setEditProfile}
          onReset={(profile) => {
            setTemporaryPassword(generateTemporaryPassword())
            setPasswordResetComplete(false)
            setActionError(null)
            setResetProfile(profile)
          }}
          onStatus={(profile) => void runStatusChange(profile)}
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
          setCreatedCredentials(null)
        }}
        title="Create Lead Generator"
        description="The account is confirmed immediately and can sign in with the password you provide."
        size="lg"
      >
        {createdCredentials ? (
          <CredentialsPanel
            title={`${createdCredentials.fullName} can sign in now.`}
            email={createdCredentials.email}
            password={createdCredentials.password}
            onDone={() => {
              setCreateOpen(false)
              setCreatedCredentials(null)
            }}
          />
        ) : (
          <AccountForm
            onCancel={() => setCreateOpen(false)}
            onCreated={async (values) => {
              setActionError(null)
              try {
                await runTeamAdminAction({ action: 'create_lead_generator', ...values })
                setCreatedCredentials({
                  fullName: values.full_name,
                  email: values.email,
                  password: values.password,
                })
                toast({
                  title: 'Lead Generator account created.',
                  description: 'The account can sign in with these credentials now.',
                  tone: 'success',
                })
                await refresh()
              } catch (caught) {
                setActionError(
                  caught instanceof Error
                    ? caught.message
                    : 'The account could not be created.',
                )
                throw caught
              }
            }}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(editProfile)}
        onClose={() => setEditProfile(null)}
        title="Edit work profile"
        description="Clarify this person’s role without changing their authorization level."
        size="md"
      >
        {editProfile ? (
          <WorkDetailsForm
            profile={editProfile}
            onCancel={() => setEditProfile(null)}
            onSaved={async () => {
              toast({ title: 'Work profile updated.', tone: 'success' })
              setEditProfile(null)
              await refresh()
            }}
          />
        ) : null}
      </Modal>
      <Modal
        open={Boolean(resetProfile)}
        onClose={() => {
          setResetProfile(null)
          setPasswordResetComplete(false)
        }}
        title="Reset login password"
        description="This immediately replaces the old password. No additional password change is required."
        size="md"
      >
        {resetProfile ? (
          passwordResetComplete ? (
            <CredentialsPanel
              title={`${resetProfile.full_name}'s password is ready.`}
              email={resetProfile.email}
              password={temporaryPassword}
              onDone={() => {
                setResetProfile(null)
                setPasswordResetComplete(false)
              }}
            />
          ) : (
            <div className="space-y-4">
              {actionError ? <Alert tone="error">{actionError}</Alert> : null}
              <Alert tone="warning">
                Share this password with {resetProfile.full_name} through a secure
                channel. It is not stored in the CRM. If this account is disabled,
                reactivate it separately after resetting the password.
              </Alert>
              <Field label="New login password">
                <Input
                  value={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.value)}
                />
              </Field>
              {!temporaryPasswordSchema.safeParse(temporaryPassword).success ? (
                <p className="text-xs text-red-600">
                  Use at least 12 characters with upper/lowercase letters, a number, and a
                  symbol.
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => void navigator.clipboard.writeText(temporaryPassword)}
                >
                  Copy password
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setTemporaryPassword(generateTemporaryPassword())}
                >
                  Generate another
                </Button>
                <Button
                  disabled={!temporaryPasswordSchema.safeParse(temporaryPassword).success}
                  onClick={async () => {
                    setAccountBusy(resetProfile.id)
                    setActionError(null)
                    try {
                      await runTeamAdminAction({
                        action: 'reset_password',
                        user_id: resetProfile.id,
                        password: temporaryPassword,
                      })
                      toast({ title: 'Login password reset.', tone: 'success' })
                      setPasswordResetComplete(true)
                      await refresh()
                    } catch (caught) {
                      setActionError(
                        caught instanceof Error
                          ? caught.message
                          : 'Password reset failed.',
                      )
                    } finally {
                      setAccountBusy(null)
                    }
                  }}
                >
                  Set new password
                </Button>
              </div>
            </div>
          )
        ) : null}
      </Modal>
    </div>
  )
}

function GeneralSettings({
  initial,
  userId,
  refresh,
}: {
  initial: Awaited<ReturnType<typeof getSettings>>
  userId: string
  refresh: () => Promise<void>
}) {
  const { toast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      organization_name: initial.organization_name,
      default_currency: initial.default_currency,
    },
  })
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <Card className="p-5">
        <h2 className="text-base font-bold text-slate-950">Organization defaults</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Set these before entering financial data. Currency conversion is intentionally
          excluded.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={handleSubmit(async (values) => {
            await saveSettings(values.organization_name, values.default_currency, userId)
            toast({ title: 'CRM settings saved.', tone: 'success' })
            await refresh()
          })}
        >
          <Field
            label="Organization name"
            error={errors.organization_name?.message}
            required
          >
            <Input {...register('organization_name')} />
          </Field>
          <Field
            label="Default currency"
            error={errors.default_currency?.message}
            hint="Three-letter ISO code, such as USD, PKR, or GBP."
            required
          >
            <Input
              maxLength={3}
              className="uppercase"
              {...register('default_currency')}
            />
          </Field>
          <Button type="submit" loading={isSubmitting}>
            Save settings
          </Button>
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="text-base font-bold text-slate-950">Fixed pipeline</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          A stable 14-stage workflow keeps reports comparable.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {PIPELINE_STAGES.map((stage) => (
            <Badge key={stage} tone={stage.includes('won') ? 'green' : 'teal'}>
              {STAGE_LABELS[stage]}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  )
}

function UsersAccess({
  profiles,
  busy,
  onCreate,
  onEdit,
  onReset,
  onStatus,
}: {
  profiles: Profile[]
  busy: string | null
  onCreate: () => void
  onEdit: (profile: Profile) => void
  onReset: (profile: Profile) => void
  onStatus: (profile: Profile) => void
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-950">Users & access</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Create and manage Lead Generator access here. Founder accounts remain a manual
            Supabase administrator action.
          </p>
        </div>
        <Button onClick={onCreate}>Add Lead Generator</Button>
      </div>
      <div className="mt-5">
        <DataTable>
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Role and job</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{profile.full_name}</p>
                  <p className="text-xs text-slate-500">{profile.email}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-700">{ROLE_LABELS[profile.role]}</p>
                  <p className="text-xs text-slate-500">
                    {profile.job_title || 'No job title set'}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={profile.account_status === 'active' ? 'green' : 'red'}>
                      {profile.account_status}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDateTime(profile.updated_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(profile)}>
                      Edit profile
                    </Button>
                    {profile.role === 'lead_generator' ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onReset(profile)}
                        >
                          Reset password
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            profile.account_status === 'active' ? 'danger' : 'secondary'
                          }
                          loading={busy === profile.id}
                          onClick={() => onStatus(profile)}
                        >
                          {profile.account_status === 'active' ? 'Disable' : 'Reactivate'}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <Alert tone="info" title="Account safety">
        <p>
          Users are disabled, not deleted, so lead, task, activity, and history ownership
          remains intact. No service-role key is used by the browser.
        </p>
      </Alert>
    </Card>
  )
}

function AccountForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (values: AccountValues) => Promise<void>
}) {
  const [password, setPassword] = useState(generateTemporaryPassword())
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AccountValues>({
    resolver: zodResolver(leadGeneratorAccountSchema),
    defaultValues: {
      full_name: '',
      email: '',
      password,
      job_title: 'Lead Generator',
      responsibilities:
        'Research qualified companies, add complete lead information, set source and segment, qualify leads, maintain data quality, and work toward assigned targets.',
    },
  })
  const generate = () => {
    const next = generateTemporaryPassword()
    setPassword(next)
    setValue('password', next, { shouldValidate: true })
  }
  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null)
        try {
          await onCreated(values)
        } catch (caught) {
          setFormError(
            caught instanceof Error
              ? caught.message
              : 'The account could not be created.',
          )
        }
      })}
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Alert tone="info">
        <strong>Authorization role:</strong> Lead Generator. Additional Founder accounts
        must be created manually in Supabase.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.full_name?.message}>
          <Input autoFocus {...register('full_name')} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" autoComplete="off" {...register('email')} />
        </Field>
      </div>
      <Field label="Login password" required error={errors.password?.message}>
        <div className="flex gap-2">
          <Input
            type="text"
            autoComplete="new-password"
            value={password}
            {...register('password', {
              onChange: (event) => setPassword(event.target.value),
            })}
          />
          <Button type="button" variant="secondary" onClick={generate}>
            Generate
          </Button>
        </div>
      </Field>
      <Field label="Job title" error={errors.job_title?.message}>
        <Input {...register('job_title')} />
      </Field>
      <Field
        label="Responsibilities"
        hint="Visible in the Founder Team view and the person’s My focus dashboard."
        error={errors.responsibilities?.message}
      >
        <Textarea rows={5} {...register('responsibilities')} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Create account
        </Button>
      </div>
    </form>
  )
}

function CredentialsPanel({
  title,
  email,
  password,
  onDone,
}: {
  title: string
  email: string
  password: string
  onDone: () => void
}) {
  const { toast } = useToast()
  const credentials = `MyPath CRM\nLogin: ${window.location.origin}/login\nEmail: ${email}\nPassword: ${password}`
  return (
    <div className="space-y-4">
      <Alert tone="success" title={title}>
        Copy these credentials now and share them through a secure channel. The password
        cannot be retrieved after this window closes.
      </Alert>
      <Field label="Email">
        <Input readOnly value={email} />
      </Field>
      <Field label="Password">
        <Input readOnly value={password} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(credentials)
              toast({ title: 'Login credentials copied.', tone: 'success' })
            } catch {
              toast({
                title: 'Credentials could not be copied.',
                description: 'Copy the email and password fields manually.',
                tone: 'error',
              })
            }
          }}
        >
          Copy credentials
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  )
}

function WorkDetailsForm({
  profile,
  onCancel,
  onSaved,
}: {
  profile: Profile
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkDetailsValues>({
    resolver: zodResolver(workDetailsSchema),
    defaultValues: {
      full_name: profile.full_name,
      job_title: profile.job_title ?? '',
      responsibilities: profile.responsibilities ?? '',
    },
  })
  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        await updateProfileWorkDetails(profile.id, values)
        await onSaved()
      })}
    >
      <Field label="Full name" required error={errors.full_name?.message}>
        <Input {...register('full_name')} />
      </Field>
      <Field label="Job title" error={errors.job_title?.message}>
        <Input {...register('job_title')} />
      </Field>
      <Field label="Responsibilities" error={errors.responsibilities?.message}>
        <Textarea rows={6} {...register('responsibilities')} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save profile
        </Button>
      </div>
    </form>
  )
}
