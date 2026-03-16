import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CONTROL_API_BASE = (process.env.CONTROL_API_BASE || 'http://127.0.0.1:18100').trim().replace(/\/$/, '')

type JsonRecord = Record<string, unknown>

async function readJSON(response: Response) {
    return response.json().catch(() => null)
}

export async function requireAdmin() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }

    const { data: profile } = await supabase
        .from('tunnel_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }

    return { user }
}

export async function sbAdmin(path: string, init?: RequestInit) {
    let apiKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
    let authorization = SUPABASE_SERVICE_KEY ? `Bearer ${SUPABASE_SERVICE_KEY}` : ''

    if (!authorization) {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const accessToken = session?.access_token?.trim()
        if (!accessToken) {
            throw new Error('Missing Supabase session token')
        }
        authorization = `Bearer ${accessToken}`
    }

    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: apiKey,
            Authorization: authorization,
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    })
}

export async function parseBody<T = JsonRecord>(req: Request): Promise<T> {
    return req.json().catch(() => ({} as T))
}

export function normalizeText(value: unknown) {
    return String(value ?? '').trim()
}

export async function ensureUniqueHostname(hostname: string, excludeRouteId?: string) {
    const params = new URLSearchParams({
        hostname: `eq.${hostname}`,
        select: 'id',
        limit: '1',
    })
    if (excludeRouteId) {
        params.set('id', `neq.${excludeRouteId}`)
    }

    const dupRes = await sbAdmin(`tunnel_routes?${params.toString()}`)
    const dups = await readJSON(dupRes)
    if (!dupRes.ok) {
        return NextResponse.json({ error: 'Hostname check failed', detail: dups }, { status: dupRes.status })
    }
    if (Array.isArray(dups) && dups.length > 0) {
        return NextResponse.json({ error: '该域名已被占用，请换一个' }, { status: 409 })
    }
    return null
}

export async function ensureTunnelExists(tunnelId: string) {
    const res = await sbAdmin(
        `tunnel_instances?id=eq.${encodeURIComponent(tunnelId)}&select=id&limit=1`,
    )
    const rows = await readJSON(res)
    if (!res.ok) {
        return NextResponse.json({ error: 'Tunnel lookup failed', detail: rows }, { status: res.status })
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: 'Tunnel not found' }, { status: 404 })
    }
    return null
}

export async function ensureRouteExists(routeId: string) {
    const res = await sbAdmin(
        `tunnel_routes?id=eq.${encodeURIComponent(routeId)}&select=id,tunnel_id,hostname,target,is_enabled&limit=1`,
    )
    const rows = await readJSON(res)
    if (!res.ok) {
        return { error: NextResponse.json({ error: 'Route lookup failed', detail: rows }, { status: res.status }) }
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        return { error: NextResponse.json({ error: 'Route not found' }, { status: 404 }) }
    }
    return { route: rows[0] }
}

export function parseIds(value: unknown) {
    if (!Array.isArray(value)) {
        return []
    }
    return value
        .map((item) => normalizeText(item))
        .filter(Boolean)
}

export function getControlAPIBase() {
    return CONTROL_API_BASE
}
