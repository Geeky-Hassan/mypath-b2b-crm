import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  refresh: () => Promise<void>
}

export function useAsyncData<T>(loader: () => Promise<T>, key: string): AsyncState<T> {
  const loaderRef = useRef(loader)
  const requestRef = useRef(0)
  const mountedRef = useRef(true)
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const nextData = await loaderRef.current()
      if (mountedRef.current && requestRef.current === requestId) setData(nextData)
    } catch (caught) {
      if (mountedRef.current && requestRef.current === requestId) {
        setError(caught instanceof Error ? caught.message : 'Something went wrong.')
      }
    } finally {
      if (mountedRef.current && requestRef.current === requestId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestRef.current += 1
    }
  }, [])

  useEffect(() => {
    void key
    void refresh()
  }, [key, refresh])

  return { data, error, loading, refresh }
}
