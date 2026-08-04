interface BrandMarkProps {
  className?: string
  label?: string
}

export function BrandMark({ className = 'size-9', label = 'MyPath' }: BrandMarkProps) {
  return (
    <img
      src="/mypath-logo.svg"
      alt={label}
      className={`shrink-0 rounded-lg object-cover shadow-[0_8px_20px_rgba(23,105,245,0.2)] ${className}`}
    />
  )
}
