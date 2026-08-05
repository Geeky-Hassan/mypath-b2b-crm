// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAsyncData } from './useAsyncData'

describe('useAsyncData', () => {
  it('does not let an older request overwrite a newer result', async () => {
    let resolveFirst: ((value: string) => void) | undefined
    let resolveSecond: ((value: string) => void) | undefined
    const loader = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve
          }),
      )

    const { result } = renderHook(() => useAsyncData(loader, 'leads'))
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    act(() => {
      void result.current.refresh()
    })
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    await act(async () => resolveSecond?.('new result'))
    await waitFor(() => expect(result.current.data).toBe('new result'))

    await act(async () => resolveFirst?.('stale result'))
    expect(result.current.data).toBe('new result')
  })

  it('keeps existing data visible while a background refresh is running', async () => {
    let resolveRefresh: ((value: string) => void) | undefined
    const loader = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('initial result')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve
          }),
      )

    const { result } = renderHook(() => useAsyncData(loader, 'leads'))
    await waitFor(() => expect(result.current.data).toBe('initial result'))

    act(() => {
      void result.current.refresh()
    })

    await waitFor(() => expect(result.current.refreshing).toBe(true))
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe('initial result')

    await act(async () => resolveRefresh?.('updated result'))
    expect(result.current.refreshing).toBe(false)
    expect(result.current.data).toBe('updated result')
  })

  it('retains the last successful data when a background refresh fails', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('stable result')
      .mockRejectedValueOnce(new Error('Temporary connection problem'))

    const { result } = renderHook(() => useAsyncData(loader, 'leads'))
    await waitFor(() => expect(result.current.data).toBe('stable result'))

    await act(async () => result.current.refresh())

    expect(result.current.data).toBe('stable result')
    expect(result.current.error).toBe('Temporary connection problem')
    expect(result.current.loading).toBe(false)
  })
})
