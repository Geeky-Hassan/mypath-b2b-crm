import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min'

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })

export const PHONE_COUNTRY_OPTIONS = getCountries()
  .map((country) => ({
    country,
    name: countryNames.of(country) ?? country,
    callingCode: getCountryCallingCode(country),
  }))
  .sort((left, right) => left.name.localeCompare(right.name))

export interface PhoneParts {
  country: CountryCode | ''
  nationalNumber: string
}

export function phoneToParts(value: string | null | undefined): PhoneParts {
  if (!value) return { country: '', nationalNumber: '' }
  const parsed = parsePhoneNumberFromString(value)
  if (!parsed) return { country: '', nationalNumber: value }
  return {
    country: parsed.country ?? '',
    nationalNumber: parsed.nationalNumber,
  }
}

export function normalizePhone(
  country: string,
  nationalNumber: string,
): { value: string; error: null } | { value: ''; error: string } {
  const input = nationalNumber.trim()
  if (!input) return { value: '', error: null }
  if (!country) return { value: '', error: 'Choose a country calling code.' }

  const parsed = parsePhoneNumberFromString(input, country as CountryCode)
  if (!parsed || !parsed.isValid()) {
    return { value: '', error: 'Enter a valid phone number for this country.' }
  }
  return { value: parsed.number, error: null }
}

export function validateE164Phone(value: string): boolean {
  if (!value.trim()) return true
  const parsed = parsePhoneNumberFromString(value.trim())
  return Boolean(parsed?.isValid() && parsed.number === value.trim())
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return '—'
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value
}
