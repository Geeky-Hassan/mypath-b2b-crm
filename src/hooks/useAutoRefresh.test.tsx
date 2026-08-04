// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutoRefresh } from './useAutoRefresh'

describe('useAutoRefresh', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('revalidates when the workspace receives focus', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useAutoRefresh(refresh, 60_000))

    await act(async () => window.dispatchEvent(new Event('focus')))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not poll a hidden tab', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderHook(() => useAutoRefresh(refresh, 1_000))

    await act(async () => vi.advanceTimersByTimeAsync(2_000))

    expect(refresh).not.toHaveBeenCalled()
  })
})
