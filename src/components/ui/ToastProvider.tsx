import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastTone = 'success' | 'error' | 'info'

interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
}

interface ToastMessage extends ToastInput {
  id: number
}

interface ToastContextValue {
  toast: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([])
  const timers = useRef(new Map<number, number>())

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer != null) window.clearTimeout(timer)
    timers.current.delete(id)
    setMessages((current) => current.filter((message) => message.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = Date.now() + Math.random()
      setMessages((current) => [...current.slice(-3), { ...input, id }])
      timers.current.set(
        id,
        window.setTimeout(() => remove(id), 4500),
      )
    },
    [remove],
  )

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer))
      timers.current.clear()
    },
    [],
  )

  const value = useMemo(() => ({ toast }), [toast])
  const tones: Record<ToastTone, string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    error: 'border-red-200 bg-red-50 text-red-950',
    info: 'border-blue-200 bg-blue-50 text-blue-950',
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(22rem,calc(100%-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`pointer-events-auto rounded-lg border px-3.5 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.1)] ${tones[message.tone ?? 'info']}`}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">{message.title}</p>
                {message.description ? (
                  <p className="mt-1 text-[11px] leading-4 opacity-80">
                    {message.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded p-1 text-[10px] opacity-60 hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                aria-label="Dismiss notification"
                onClick={() => remove(message.id)}
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider.')
  return value
}
