// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SynchronizedHorizontalScroll } from './SynchronizedHorizontalScroll'

describe('SynchronizedHorizontalScroll', () => {
  afterEach(() => vi.restoreAllMocks())

  it('measures the full board and synchronizes scrolling in both directions', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(4200)
    render(
      <SynchronizedHorizontalScroll>
        <div>Pipeline columns</div>
      </SynchronizedHorizontalScroll>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('pipeline-scroll-spacer').style.width).toBe('4200px'),
    )

    const top = screen.getByLabelText('Pipeline top horizontal scroll')
    const bottom = screen.getByLabelText('Pipeline board horizontal scroll')

    bottom.scrollLeft = 900
    fireEvent.scroll(bottom)
    expect(top.scrollLeft).toBe(900)

    top.scrollLeft = 1600
    fireEvent.scroll(top)
    expect(bottom.scrollLeft).toBe(1600)
  })

  it('supports screen-specific labels and spacer identifiers', () => {
    render(
      <SynchronizedHorizontalScroll
        topAriaLabel="Leads table top horizontal scroll"
        bottomAriaLabel="Leads table horizontal scroll"
        spacerTestId="leads-scroll-spacer"
      >
        <div>Lead rows</div>
      </SynchronizedHorizontalScroll>,
    )

    expect(screen.getByLabelText('Leads table top horizontal scroll')).toBeTruthy()
    expect(screen.getByLabelText('Leads table horizontal scroll')).toBeTruthy()
    expect(screen.getByTestId('leads-scroll-spacer')).toBeTruthy()
  })
})
