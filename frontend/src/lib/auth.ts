import { BACKEND_URL } from './constants'

const TOKEN_KEY = 'simexam_jwt'
const USER_KEY = 'simexam_user'

export interface AuthUser {
  userId: string
  orgId: string
  orgSlug: string
  role: 'admin' | 'viewer' | 'student'
  email: string
  name?: string
}

export function getToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null

  try {
    const payloadBase64 = token.split('.')[1]
    if (!payloadBase64) return token // Not a valid JWT, let backend reject it
    
    const payload = JSON.parse(atob(payloadBase64))
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.warn('[Auth] Token expired, logging out')
      logout()
      return null
    }
  } catch (err) {
    // Ignore parsing errors, let backend handle invalid tokens
  }

  return token
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.location.href = '/login'
}

/**
 * Login with email/password. Returns the full AuthUser with all fields populated.
 */
export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }))
    throw new Error(err.error || 'Login failed')
  }
  const data = await res.json()
  const user: AuthUser = {
    userId: data.userId,
    orgId: data.orgId,
    orgSlug: data.orgSlug,
    role: data.role || 'admin',
    email,
  }
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}

/**
 * Register a new org + admin user.
 */
export async function registerUser(email: string, password: string, orgSlug: string, orgName: string): Promise<AuthUser> {
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, orgSlug, orgName }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Registration failed' }))
    throw new Error(err.error || 'Registration failed')
  }
  const data = await res.json()
  const user: AuthUser = {
    userId: data.userId,
    orgId: data.orgId,
    orgSlug: data.orgSlug || orgSlug,
    role: 'admin',
    email,
  }
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}

/**
 * Verify a student invite token. Returns the AuthUser including orgSlug (actual slug, not UUID).
 */
export async function verifyStudentToken(token: string): Promise<AuthUser> {
  const res = await fetch(`${BACKEND_URL}/api/auth/student/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Invalid token' }))
    throw new Error(err.error || 'Invalid token')
  }
  const data = await res.json()
  const user: AuthUser = {
    userId: data.userId,
    orgId: data.orgId,
    orgSlug: data.orgSlug || 'demo',
    role: 'student',
    email: '',
    name: data.name,
  }
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}

/**
 * Log in as a demo user (student or admin) without requiring invite tokens.
 */
export async function loginDemoUser(
  role: 'admin' | 'student' | 'viewer' = 'student',
  orgSlug: string = 'demo',
  name: string = 'Demo User'
): Promise<AuthUser> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/student/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'DEMO-TOKEN' }),
    })
    if (res.ok) {
      const data = await res.json()
      const user: AuthUser = {
        userId: data.userId || 'demo-student-id',
        orgId: data.orgId || 'demo-org-id',
        orgSlug: data.orgSlug || orgSlug,
        role,
        email: `${role}@simexam.ai`,
        name: name || data.name || 'Demo User',
      }
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(user))
      return user
    }
  } catch (err) {
    // Fallback if backend is starting up
  }

  const user: AuthUser = {
    userId: `demo-${role}-${Date.now()}`,
    orgId: 'demo-org-id',
    orgSlug,
    role,
    email: `${role}@simexam.ai`,
    name,
  }
  const fakeToken = `demo.jwt.${Date.now()}`
  localStorage.setItem(TOKEN_KEY, fakeToken)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}
