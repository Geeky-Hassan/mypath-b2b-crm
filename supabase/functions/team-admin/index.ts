import { createClient } from 'npm:@supabase/supabase-js@2.112.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AccountAction =
  | 'create_lead_generator'
  | 'reset_password'
  | 'set_account_status'
  | 'delete_lead_generator'
  | 'change_own_password'

interface RequestBody {
  action?: AccountAction
  user_id?: string
  email?: string
  password?: string
  full_name?: string
  job_title?: string
  responsibilities?: string
  account_status?: 'active' | 'disabled'
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function passwordIssue(value: string | undefined): string | null {
  if (!value || value.length < 12) return 'Use at least 12 characters.'
  if (!/[a-z]/.test(value)) return 'Add a lowercase letter.'
  if (!/[A-Z]/.test(value)) return 'Add an uppercase letter.'
  if (!/[0-9]/.test(value)) return 'Add a number.'
  if (!/[^A-Za-z0-9]/.test(value)) return 'Add a symbol.'
  return null
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase function secrets are not available.')
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })

  const authorization = request.headers.get('Authorization')
  const accessToken = authorization?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json(401, { error: 'Authentication is required.' })

  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(accessToken)
  if (authError || !user) return json(401, { error: 'Your session is not valid.' })

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return json(400, { error: 'Request body must be valid JSON.' })
  }

  if (!body.action) return json(400, { error: 'Choose an account action.' })

  const { data: callerProfile, error: callerError } = await admin
    .from('profiles')
    .select('id, role, account_status')
    .eq('id', user.id)
    .single()
  if (callerError || !callerProfile || callerProfile.account_status !== 'active') {
    return json(403, { error: 'This CRM account is not active.' })
  }

  if (body.action === 'change_own_password') {
    const issue = passwordIssue(body.password)
    if (issue) return json(400, { error: issue })

    const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, {
      password: body.password,
    })
    if (passwordError) return json(400, { error: 'The password could not be changed.' })

    const { error: profileError } = await admin
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id)
    if (profileError) {
      return json(500, {
        error: 'The password changed, but CRM access could not be unlocked. Try again.',
      })
    }
    return json(200, { ok: true })
  }

  if (callerProfile.role !== 'founder') {
    return json(403, { error: 'Only the Founder can manage CRM accounts.' })
  }

  if (body.action === 'create_lead_generator') {
    const email = body.email?.trim().toLowerCase()
    const fullName = body.full_name?.trim()
    const issue = passwordIssue(body.password)
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return json(400, { error: 'Enter a valid email address.' })
    }
    if (!fullName) return json(400, { error: 'Full name is required.' })
    if (issue) return json(400, { error: issue })

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (createError || !created.user) {
      const duplicate = /already|registered|exists/i.test(createError?.message ?? '')
      return json(400, {
        error: duplicate
          ? 'An account already exists for this email.'
          : 'The account could not be created.',
      })
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        full_name: fullName,
        role: 'lead_generator',
        job_title: clean(body.job_title),
        responsibilities: clean(body.responsibilities),
        account_status: 'active',
        must_change_password: false,
      })
      .eq('id', created.user.id)
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json(500, { error: 'The CRM profile could not be created.' })
    }

    return json(201, {
      ok: true,
      user: {
        id: created.user.id,
        email,
        full_name: fullName,
        role: 'lead_generator',
        account_status: 'active',
      },
    })
  }

  if (!body.user_id) return json(400, { error: 'Choose a Lead Generator.' })
  if (body.user_id === user.id) {
    return json(400, { error: 'Founder accounts cannot be managed from this page.' })
  }

  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, full_name, email, role, account_status, must_change_password')
    .eq('id', body.user_id)
    .single()
  if (targetError || !target || target.role !== 'lead_generator') {
    return json(404, { error: 'Lead Generator account not found.' })
  }
  if (target.account_status === 'removed') {
    return json(404, { error: 'Lead Generator account not found.' })
  }

  if (body.action === 'delete_lead_generator') {
    const { data: authRecord, error: authRecordError } =
      await admin.auth.admin.getUserById(target.id)
    if (authRecordError || !authRecord.user) {
      return json(404, { error: 'Authentication account not found.' })
    }

    const removedEmail = `removed-${target.id}@removed.invalid`
    const previousMetadata = authRecord.user.user_metadata
    const { error: quarantineError } = await admin.auth.admin.updateUserById(target.id, {
      email: removedEmail,
      email_confirm: true,
      ban_duration: '876000h',
      user_metadata: { full_name: 'Former team member', removed: true },
    })
    if (quarantineError) {
      return json(400, { error: 'The authentication account could not be removed.' })
    }

    const { data: cleanup, error: cleanupError } = await admin.rpc(
      'remove_lead_generator_account',
      { p_user_id: target.id, p_removed_by: user.id },
    )
    if (cleanupError) {
      const { error: rollbackError } = await admin.auth.admin.updateUserById(target.id, {
        email: target.email,
        email_confirm: true,
        ban_duration: target.account_status === 'active' ? 'none' : '876000h',
        user_metadata: previousMetadata,
      })
      return json(500, {
        error: rollbackError
          ? 'No CRM records were deleted, but the login remains blocked. Restore it in Supabase Authentication.'
          : 'Nothing was deleted because CRM account cleanup could not be completed.',
      })
    }

    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const retiredPassword = `Rm!9${Array.from(randomBytes, (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('')}`
    await admin.auth.admin.updateUserById(target.id, { password: retiredPassword })

    return json(200, { ok: true, cleanup })
  }

  if (body.action === 'reset_password') {
    const issue = passwordIssue(body.password)
    if (issue) return json(400, { error: issue })

    const { error: flagError } = await admin
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', target.id)
    if (flagError) return json(500, { error: 'Password reset could not be prepared.' })

    const { error: resetError } = await admin.auth.admin.updateUserById(target.id, {
      password: body.password,
      email_confirm: true,
    })
    if (resetError) {
      await admin
        .from('profiles')
        .update({ must_change_password: target.must_change_password })
        .eq('id', target.id)
      return json(400, { error: 'The new login password could not be set.' })
    }
    return json(200, { ok: true })
  }

  if (body.action === 'set_account_status') {
    const accountStatus = body.account_status
    if (!accountStatus || !['active', 'disabled'].includes(accountStatus)) {
      return json(400, { error: 'Choose an active or disabled account status.' })
    }
    const disabled = accountStatus === 'disabled'
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(target.id, {
      ban_duration: disabled ? '876000h' : 'none',
      ...(disabled ? {} : { email_confirm: true }),
    })
    if (authUpdateError) {
      return json(400, { error: 'The authentication account could not be updated.' })
    }

    const { error: statusError } = await admin
      .from('profiles')
      .update({ account_status: accountStatus })
      .eq('id', target.id)
    if (statusError) {
      await admin.auth.admin.updateUserById(target.id, {
        ban_duration: disabled ? 'none' : '876000h',
      })
      return json(500, { error: 'The CRM account status could not be updated.' })
    }
    return json(200, { ok: true, account_status: accountStatus })
  }

  return json(400, { error: 'Unsupported account action.' })
})
