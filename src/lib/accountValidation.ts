import { z } from 'zod'

export const temporaryPasswordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .regex(/[a-z]/, 'Add a lowercase letter.')
  .regex(/[A-Z]/, 'Add an uppercase letter.')
  .regex(/[0-9]/, 'Add a number.')
  .regex(/[^A-Za-z0-9]/, 'Add a symbol.')

export const leadGeneratorAccountSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: temporaryPasswordSchema,
  job_title: z.string().trim().max(120).optional(),
  responsibilities: z.string().trim().max(3000).optional(),
})

export function generateTemporaryPassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const generated = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join(
    '',
  )
  return `Aa1!${generated}`
}
