import { NextRequest, NextResponse } from 'next/server'
import { getControlAPIBase, requireAdmin } from '../../../_lib'

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    const admin = await requireAdmin()
    if (admin.error) {
        return admin.error
    }

    const tunnelId = String(params.id || '').trim()
    if (!tunnelId) {
        return NextResponse.json({ error: 'Tunnel id is required' }, { status: 400 })
    }

    const controlBase = getControlAPIBase()
    const response = await fetch(`${controlBase}/api/tunnels/${encodeURIComponent(tunnelId)}/command`, {
        cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload) {
        return NextResponse.json(
            { error: 'Failed to load tunnel commands', detail: payload },
            { status: response.status || 500 },
        )
    }

    return NextResponse.json(payload)
}
