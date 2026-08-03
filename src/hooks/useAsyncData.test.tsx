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
})
