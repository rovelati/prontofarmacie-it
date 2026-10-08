import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Lock } from 'lucide-react'

const ADMIN_USERNAME = 'prontofarmacie'
const ADMIN_PASSWORD = 'baumicio'

export default function BasicAuthGate({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    // Verifica se l'utente è già autenticato (sessionStorage)
    const auth = sessionStorage.getItem('admin_auth')
    if (auth === 'authenticated') {
      setIsAuthenticated(true)
    }
  }, [])

  const handleLogin = (e) => {
    e.preventDefault()
    setError('')
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin_auth', 'authenticated')
      setIsAuthenticated(true)
    } else {
      setError('Credenziali non valide')
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth')
    setIsAuthenticated(false)
    setUsername('')
    setPassword('')
    window.location.href = '/admin-test/'
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--ac-bg)] text-[var(--ac-text)]">
        <Card className="w-full max-w-md border-[var(--ac-border)] bg-[var(--ac-card)]">
          <CardHeader>
            <div className="flex items-center gap-2 text-[var(--ac-text)]">
              <Lock className="w-5 h-5" />
              <CardTitle>Accesso Amministratore</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Inserisci username"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Inserisci password"
                />
              </div>
              {error && (
                <div className="text-sm rounded p-2 bg-[var(--ac-danger-bg)] text-[var(--ac-danger-fg)]">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full">
                Accedi
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      {children}
    </>
  )
}
