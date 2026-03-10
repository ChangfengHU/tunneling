'use server'

import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect'

const CONTROL_API_BASE = process.env.CONTROL_API_BASE || 'http://127.0.0.1:18100'

export async function login(formData: FormData) {
    const tunnelId = formData.get('tunnel_id') as string

    if (!tunnelId) {
        redirect('/login?error=Tunnel ID is required')
    }

    try {
        const response = await fetch(`${CONTROL_API_BASE}/api/portal/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tunnel_id: tunnelId }),
        })

        if (!response.ok) {
            redirect('/login?error=Invalid Tunnel ID or Tunnel not found')
        }

        redirect(`/portal/dashboard?tunnel_id=${encodeURIComponent(tunnelId)}`)
    } catch (error) {
        if (isRedirectError(error)) throw error
        console.error('Login error:', error)
        redirect('/login?error=Failed to verify Tunnel ID')
    }
}
