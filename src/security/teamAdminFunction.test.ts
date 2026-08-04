import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const edgeFunction = readFileSync(
  new URL('../../supabase/functions/team-admin/index.ts', import.meta.url),
  'utf8',
)
const frontendSources = ['../lib/config.ts', '../lib/supabase.ts', '../services/crm.ts']
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n')

describe('team-admin Edge Function contract', () => {
  it('validates the caller and reserves administrative actions for the founder', () => {
    expect(edgeFunction).toContain('admin.auth.getUser(accessToken)')
    expect(edgeFunction).toContain("callerProfile.role !== 'founder'")
    expect(edgeFunction).toContain("target.role !== 'lead_generator'")
  })

  it('creates confirmed Lead Generator accounts with immediately usable passwords', () => {
    expect(edgeFunction).toContain('email_confirm: true')
    expect(edgeFunction).toContain("role: 'lead_generator'")
    expect(edgeFunction).toContain('must_change_password: false')
    expect(edgeFunction).not.toContain('must_change_password: true')
  })

  it('confirms email on password reset and reactivation', () => {
    expect(edgeFunction).toMatch(
      /body\.action === 'reset_password'[\s\S]*password: body\.password,[\s\S]*email_confirm: true/,
    )
    expect(edgeFunction).toMatch(
      /body\.action === 'set_account_status'[\s\S]*ban_duration:[\s\S]*email_confirm: true/,
    )
  })

  it('never puts the service role secret in frontend source', () => {
    expect(edgeFunction).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')")
    expect(frontendSources).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('quarantines a removed account and delegates atomic CRM cleanup', () => {
    expect(edgeFunction).toContain("body.action === 'delete_lead_generator'")
    expect(edgeFunction).toContain("ban_duration: '876000h'")
    expect(edgeFunction).toContain("'remove_lead_generator_account'")
    expect(edgeFunction).toContain('p_removed_by: user.id')
    expect(edgeFunction).toContain("full_name: 'Former team member'")
    expect(edgeFunction).not.toContain('deleteUser(target.id)')
  })

  it('returns sanitized password errors and never logs request bodies', () => {
    expect(edgeFunction).not.toContain('console.log')
    expect(edgeFunction).not.toMatch(/json\([^\n]+password: body\.password/)
    expect(edgeFunction).toContain('The new login password could not be set.')
  })
})
