import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from './api'
import { SettingsPage } from './Workspace'

vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const props = {
  theme: 'light', setTheme: vi.fn(), weekStart: 'sunday', setWeekStart: vi.fn(),
  prefs: { showChoirs: true, showStartHere: true }, setPrefs: vi.fn(),
}

describe('settings data portability', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(['backup']) } as never)
    vi.mocked(api.post).mockResolvedValue({ data: { counts: { choirs: 1, songs: 2, events: 3 } } } as never)
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('downloads JSON and ZIP exports as files', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:backup')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<SettingsPage {...props} />)

    await user.click(screen.getByRole('button', { name: 'JSON' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/auth/export/?type=json', { responseType: 'blob' }))
    expect(await screen.findByRole('status')).toHaveTextContent('downloaded')
    await user.click(screen.getByRole('button', { name: 'ZIP backup' }))
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/auth/export/?type=zip', { responseType: 'blob' }))
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(click).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('uploads a selected backup in merge mode', async () => {
    const user = userEvent.setup()
    render(<SettingsPage {...props} />)
    const file = new File(['{}'], 'my-backup.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Backup file'), file)
    await user.click(screen.getByRole('button', { name: 'Import' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/import/', expect.any(FormData)))
    const body = vi.mocked(api.post).mock.calls[0][1] as FormData
    expect(body.get('mode')).toBe('merge')
    expect((body.get('file') as File).name).toBe('my-backup.json')
    expect(await screen.findByRole('status')).toHaveTextContent('1 choirs, 2 songs, and 3 events')
  })

  it('requires confirmation before replace and skips upload when cancelled', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SettingsPage {...props} />)
    const file = new File(['backup'], 'backup.zip', { type: 'application/zip' })
    await user.upload(screen.getByLabelText('Backup file'), file)
    await user.selectOptions(screen.getByLabelText('Import behavior'), 'replace')
    await user.click(screen.getByRole('button', { name: 'Import' }))

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(api.post).not.toHaveBeenCalled()
  })
})
