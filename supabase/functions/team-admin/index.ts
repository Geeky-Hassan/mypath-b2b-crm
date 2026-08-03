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
    if (fullName.length > 120) return json(400, { error: 'Full name is too long.' })
    if ((body.job_title?.length ?? 0) > 120) {
      return json(400, { error: 'Job title is too long.' })
    }
    if ((body.responsibilities?.length ?? 0) > 3000) {
      return json(400, { error: 'Responsibilities are too long.' })
    }

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
        must_change_password: true,
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
    .select('id, role, account_status, must_change_password')
    .eq('id', body.user_id)
    .single()
  if (targetError || !target || target.role !== 'lead_generator') {
    return json(404, { error: 'Lead Generator account not found.' })
  }

  if (body.action === 'reset_password') {
    const issue = passwordIssue(body.password)
    if (issue) return json(400, { error: issue })

    const { error: flagError } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', target.id)
    if (flagError) return json(500, { error: 'Password reset could not be prepared.' })

    const { error: resetError } = await admin.auth.admin.updateUserById(target.id, {
      password: body.password,
    })
    if (resetError) {
      await admin
        .from('profiles')
        .update({ must_change_password: target.must_change_password })
        .eq('id', target.id)
      return json(400, { error: 'The temporary password could not be set.' })
    }
    return json(200, { ok: true })
  }

  if (body.action === 'set_account_status') {
    if (!body.account_status) return json(400, { error: 'Choose an account status.' })
    const disabled = body.account_status === 'disabled'
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(target.id, {
      ban_duration: disabled ? '876000h' : 'none',
    })
    if (authUpdateError) {
      return json(400, { error: 'The authentication account could not be updated.' })
    }

    const { error: statusError } = await admin
      .from('profiles')
      .update({ account_status: body.account_status })
      .eq('id', target.id)
    if (statusError) {
      await admin.auth.admin.updateUserById(target.id, {
        ban_duration: disabled ? 'none' : '876000h',
      })
      return json(500, { error: 'The CRM account status could not be updated.' })
    }
    return json(200, { ok: true, account_status: body.account_status })
  }

  return json(400, { error: 'Unsupported account action.' })
})
