import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function sbAdmin(path: string, init?: RequestInit) {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    })
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('tunnel_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const routeId = params.id
    const body = await req.json().catch(() => ({}))
    const { hostname } = body

    if (!hostname || !String(hostname).trim()) {
        return NextResponse.json({ error: '域名不能为空' }, { status: 400 })
    }
    const trimmed = String(hostname).trim()

    // Uniqueness check across all routes
    const dupRes = await sbAdmin(
        `tunnel_routes?hostname=eq.${encodeURIComponent(trimmed)}&id=neq.${encodeURIComponent(routeId)}&select=id&limit=1`,
    )
    const dups = await dupRes.json()
    if (Array.isArray(dups) && dups.length > 0) {
        return NextResponse.json({ error: '该域名已被占用，请换一个' }, { status: 409 })
    }

    const updateRes = await sbAdmin(
        `tunnel_routes?id=eq.${encodeURIComponent(routeId)}`,
        {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ hostname: trimmed }),
        },
    )
    const updated = await updateRes.json()

    if (!updateRes.ok) {
        return NextResponse.json({ error: 'Update failed', detail: updated }, { status: 500 })
    }

    const route = Array.isArray(updated) ? updated[0] : updated
    return NextResponse.json({ route })
}
