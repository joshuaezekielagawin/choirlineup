import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { RouteErrorBoundary } from './RouteErrorBoundary'

function BrokenPractice(): ReactNode { throw new Error('simulated render failure') }

describe('route error boundary', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('shows a recovery link instead of leaving a blank page after a render error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MemoryRouter><RouteErrorBoundary title="Practice" returnTo="/events" returnLabel="Return to events"><BrokenPractice /></RouteErrorBoundary></MemoryRouter>)

    expect(screen.getByRole('alert')).toHaveTextContent('Practice hit an unexpected error.')
    expect(screen.getByText('simulated render failure')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to events' })).toHaveAttribute('href', '/events')
  })
})
