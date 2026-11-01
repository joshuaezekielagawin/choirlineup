import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, type Choir, type ChoirEvent } from './api'
import { EventsPage } from './Events'

vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

const choir: Choir = { id: 12, name: 'Riverside Choir', description: '', color: '#728b72', voice_classification: 'tenor', custom_voice: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const event: ChoirEvent = {
  id: 31, title: 'Spring Concert', choir: { id: choir.id, name: choir.name, color: choir.color }, date: '2026-12-12', start_time: '19:00:00', end_time: '21:00:00', venue: 'Town Hall', description: '', preparation_deadline: '2026-12-01', status: 'preparing', lineup: [], lineup_count: 2, ready_count: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

function renderEvents() {
  return render(<MemoryRouter initialEntries={['/events']}><Routes><Route path="/events/*" element={<EventsPage choirs={[choir]} />} /></Routes></MemoryRouter>)
}

describe('events', () => {
  beforeEach(() => { vi.resetAllMocks() })
  afterEach(() => cleanup())

  it('shows upcoming event readiness and filters by status', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [event] } as never)
    const user = userEvent.setup()
    renderEvents()
    expect(await screen.findByText('Spring Concert')).toBeInTheDocument()
    expect(screen.getByText('1/2 songs ready')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Completed' }))
    expect(screen.getByText('No events in this view')).toBeInTheDocument()
  })
})
