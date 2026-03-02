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

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const routeId = params.id
    const body = await req.json().catch(() => ({}))
    const { tunnel_id, token, hostname, is_enabled } = body

    if (!tunnel_id || !token) {
        return NextResponse.json({ error: 'tunnel_id and token required' }, { status: 400 })
    }

    // Verify: the token must match what's stored for this tunnel
    const verifyRes = await sbFetch(
        `tunnel_instances?id=eq.${encodeURIComponent(tunnel_id)}&select=id,token_hash&limit=1`,
    )
    const tunnels = await verifyRes.json()
    if (!verifyRes.ok || !Array.isArray(tunnels) || tunnels.length === 0) {
        return NextResponse.json({ error: 'Tunnel not found' }, { status: 404 })
    }
    if (tunnels[0].token_hash !== token) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
    }

    // Verify: the route belongs to this tunnel
    const routeCheckRes = await sbFetch(
        `tunnel_routes?id=eq.${encodeURIComponent(routeId)}&tunnel_id=eq.${encodeURIComponent(tunnel_id)}&select=id&limit=1`,
    )
    const routeCheck = await routeCheckRes.json()
    if (!routeCheckRes.ok || !Array.isArray(routeCheck) || routeCheck.length === 0) {
        return NextResponse.json({ error: 'Route not found or access denied' }, { status: 404 })
    }

    // Build patch payload
    const patch: Record<string, unknown> = {}
    if (hostname !== undefined) {
        const trimmed = String(hostname).trim()
        if (!trimmed) return NextResponse.json({ error: '域名不能为空' }, { status: 400 })

        // Uniqueness check across all routes
        const dupRes = await sbFetch(
            `tunnel_routes?hostname=eq.${encodeURIComponent(trimmed)}&id=neq.${encodeURIComponent(routeId)}&select=id&limit=1`,
        )
        const dups = await dupRes.json()
        if (Array.isArray(dups) && dups.length > 0) {
            return NextResponse.json({ error: '该域名已被占用，请换一个' }, { status: 409 })
        }
        patch.hostname = trimmed
    }
    if (is_enabled !== undefined) {
        patch.is_enabled = Boolean(is_enabled)
    }

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updateRes = await sbFetch(
        `tunnel_routes?id=eq.${encodeURIComponent(routeId)}&tunnel_id=eq.${encodeURIComponent(tunnel_id)}`,
        {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(patch),
        },
    )
    const updated = await updateRes.json()

    if (!updateRes.ok) {
        return NextResponse.json({ error: 'Update failed', detail: updated }, { status: 500 })
    }

    const route = Array.isArray(updated) ? updated[0] : updated
    return NextResponse.json({ route })
}
