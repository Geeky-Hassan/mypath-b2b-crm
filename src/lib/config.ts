import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z
    .string()
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
})

const parsed = envSchema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
})

export const env = parsed.success ? parsed.data : null
export const envIssues = parsed.success
  ? []
  : parsed.error.issues.map((issue) => issue.path.join('.'))
