import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function sbFetch(path: string, init?: RequestInit) {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    })
}

export async function POST(req: NextRequest) {
    const { tunnel_id } = await req.json().catch(() => ({}))
    if (!tunnel_id) {
        return NextResponse.json({ error: 'tunnel_id is required' }, { status: 400 })
    }

    const res = await sbFetch(
        `tunnel_instances?id=eq.${encodeURIComponent(tunnel_id)}&select=id,name,token_hash&limit=1`,
    )
    const rows = await res.json()

    if (!res.ok || !Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: '找不到该 Tunnel，请确认 ID 是否正确' }, { status: 404 })
    }

    const tunnel = rows[0]
    return NextResponse.json({
        tunnel: {
            id: tunnel.id,
            name: tunnel.name,
            token: tunnel.token_hash ?? '',
        },
    })
}
