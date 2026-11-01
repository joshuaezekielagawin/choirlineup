import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Music2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { api, type AuthResponse, type User } from './api'
import { Workspace } from './Workspace'

const voiceOptions = ['soprano', 'alto', 'tenor', 'bass', 'custom']
type AuthFields = { full_name?: string; email: string; default_voice?: string; password: string; confirm_password?: string }

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!localStorage.getItem('choirlineup-token')) { setReady(true); return }
    api.get<User>('/auth/profile/').then(({ data }) => setUser(data)).catch(() => localStorage.removeItem('choirlineup-token')).finally(() => setReady(true))
  }, [])

  function acceptAuth(data: AuthResponse) {
    localStorage.setItem('choirlineup-token', data.token)
    setUser(data.user)
  }

  if (!ready) return <div className="loading">Opening your music folder…</div>
  return <Routes>
    <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <AuthPage mode="login" onAuth={acceptAuth} />} />
    <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <AuthPage mode="register" onAuth={acceptAuth} />} />
    <Route path="*" element={user ? <Workspace user={user} onUserChange={setUser} onLogout={() => { localStorage.removeItem('choirlineup-token'); setUser(null) }} /> : <Navigate to="/login" />} />
  </Routes>
}

function AuthPage({ mode, onAuth }: { mode: 'login' | 'register'; onAuth: (data: AuthResponse) => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { register: bindField, handleSubmit, formState: { errors: formErrors } } = useForm<AuthFields>()
  const register = mode === 'register'
  async function submit(values: AuthFields) {
    setError(''); setBusy(true)
    try {
      const { data } = await api.post<AuthResponse>(`/auth/${register ? 'register' : 'login'}/`, values)
      onAuth(data); navigate('/dashboard')
    } catch (e: any) {
      const detail = e.response?.data
      setError(typeof detail === 'string' ? detail : Object.values(detail || {}).flat().join(' ') || 'Unable to connect. Check that the ChoirLineup backend is running.')
    } finally { setBusy(false) }
  }
  return <main className="auth-shell min-h-screen">
    <section className="brand-panel">
      <div className="brand-lockup"><span className="brand-icon"><Music2 size={22} /></span><span>ChoirLineup</span></div>
      <div className="brand-copy"><p className="eyebrow">YOUR MUSIC, IN HARMONY</p><h1>Every song.<br />Every choir.<br /><em>In one place.</em></h1><p>Keep your repertoire organized and your next performance in tune.</p></div>
      <div className="staff-lines" aria-hidden="true">♫</div>
    </section>
    <section className="form-panel"><div className="form-wrap">
      <div className="mobile-brand"><Music2 size={20} /> ChoirLineup</div>
      <p className="eyebrow">{register ? 'A FRESH START' : 'WELCOME BACK'}</p>
      <h2>{register ? 'Create your account' : 'Sign in to your space'}</h2>
      <p className="muted">{register ? 'Your choirs and practice plans, all together.' : 'Pick up where your last rehearsal left off.'}</p>
      <form onSubmit={handleSubmit(submit)}>
        {register && <label>Full name<input autoComplete="name" {...bindField('full_name', { required: 'Enter your full name.' })} /></label>}
        <label>Email address<input type="email" autoComplete="email" {...bindField('email', { required: 'Enter your email.', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address.' } })} /></label>
        {register && <label>Your voice<select defaultValue="custom" {...bindField('default_voice', { required: true })}>{voiceOptions.map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}</select></label>}
        <label>Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} {...bindField('password', { required: 'Enter your password.', minLength: register ? { value: 8, message: 'Use at least 8 characters.' } : undefined })} /></label>
        {register && <label>Confirm password<input type="password" autoComplete="new-password" {...bindField('confirm_password', { required: 'Confirm your password.', validate: (value, values) => value === values.password || 'Passwords do not match.' })} /></label>}
        {Object.values(formErrors)[0]?.message && <div className="error" role="alert">{Object.values(formErrors)[0].message}</div>}
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'} <span>→</span></button>
      </form>
      <p className="switch-auth">{register ? 'Already have an account?' : 'New to ChoirLineup?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
    </div></section>
  </main>
}

export default App
