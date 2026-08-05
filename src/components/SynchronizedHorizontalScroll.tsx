import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react'

export function SynchronizedHorizontalScroll({ children }: { children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(0)

  const measure = useCallback(() => {
    setContentWidth(contentRef.current?.scrollWidth ?? 0)
  }, [])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (contentRef.current) observer?.observe(contentRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [measure])

  const synchronize = (
    event: UIEvent<HTMLDivElement>,
    target: React.RefObject<HTMLDivElement | null>,
  ) => {
    const nextLeft = event.currentTarget.scrollLeft
    if (target.current && target.current.scrollLeft !== nextLeft) {
      target.current.scrollLeft = nextLeft
    }
  }

  return (
    <div className="relative">
      <div className="sticky top-16 z-10 bg-white/95 pb-1 pt-1 backdrop-blur-sm">
        <div
          ref={topRef}
          className="min-h-4 overflow-x-scroll overscroll-x-contain"
          onScroll={(event) => synchronize(event, bottomRef)}
          aria-label="Pipeline top horizontal scroll"
          tabIndex={0}
        >
          <div
            data-testid="pipeline-scroll-spacer"
            className="h-px"
            style={{ width: `${contentWidth}px` }}
          />
        </div>
      </div>
      <div
        ref={bottomRef}
        className="overflow-x-auto overscroll-x-contain pb-5"
        onScroll={(event) => synchronize(event, topRef)}
        aria-label="Pipeline board horizontal scroll"
        tabIndex={0}
      >
        <div ref={contentRef} className="w-max">
          {children}
        </div>
      </div>
    </div>
  )
}
