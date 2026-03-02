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

export async function GET(req: NextRequest) {
    const tunnel_id = req.nextUrl.searchParams.get('tunnel_id')
    if (!tunnel_id) {
        return NextResponse.json({ error: 'tunnel_id is required' }, { status: 400 })
    }

    const res = await sbFetch(
        `tunnel_routes?tunnel_id=eq.${encodeURIComponent(tunnel_id)}&select=id,tunnel_id,hostname,target,is_enabled,created_at&order=created_at.asc`,
    )
    const rows = await res.json()

    if (!res.ok) {
        return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 })
    }

    return NextResponse.json({ routes: rows ?? [] })
}
