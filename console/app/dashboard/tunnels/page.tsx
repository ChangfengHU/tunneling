'use client'

import { useEffect, useState } from 'react'
import {
    AlertTriangle,
    CheckCircle2,
    Copy,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Server,
    ShieldAlert,
    Trash2,
    X,
    XCircle,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

type TunnelRoute = {
    id: string
    tunnel_id: string
    hostname: string
    target: string
    is_enabled: boolean
}

type Tunnel = {
    id: string
    name: string
    status: 'online' | 'offline'
    created_at: string
    updated_at?: string
    token_hash: string
    owner_id?: string | null
    project_key?: string | null
    client_ip?: string | null
    os_type?: string | null
    tunnel_routes: TunnelRoute[]
}

type TunnelForm = {
    id?: string
    name: string
    token_hash: string
    owner_id: string
    project_key: string
    status: 'online' | 'offline'
    client_ip: string
    os_type: string
}

type RouteForm = {
    id?: string
    tunnel_id: string
    hostname: string
    target: string
    is_enabled: boolean
}

type TunnelCommandState = {
    tunnel_id: string
    agent_command: string
    docker_command: string
    agent_config_url?: string
}

type ConfirmState =
    | {
          title: string
          description: string
          action: () => Promise<void>
      }
    | null

const EMPTY_TUNNEL_FORM: TunnelForm = {
    name: '',
    token_hash: '',
    owner_id: '',
    project_key: '',
    status: 'offline',
    client_ip: '',
    os_type: '',
}

const EMPTY_ROUTE_FORM: RouteForm = {
    tunnel_id: '',
    hostname: '',
    target: '127.0.0.1:3000',
    is_enabled: true,
}

function normalizeTunnel(row: any): Tunnel {
    return {
        id: row.id,
        name: row.name,
        status: row.status === 'online' ? 'online' : 'offline',
        created_at: row.created_at,
        updated_at: row.updated_at,
        token_hash: row.token_hash,
        owner_id: row.owner_id,
        project_key: row.project_key,
        client_ip: row.client_ip,
        os_type: row.os_type,
        tunnel_routes: Array.isArray(row.tunnel_routes) ? row.tunnel_routes : [],
    }
}

function formatDate(value?: string | null) {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
}

function routeCount(tunnel: Tunnel) {
    return tunnel.tunnel_routes.length
}

function createTokenSeed() {
    return globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `${Date.now()}${Math.random().toString(16).slice(2)}`
}

export default function TunnelsPage() {
    const supabase = createClient()

    const [tunnels, setTunnels] = useState<Tunnel[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [selectedTunnelId, setSelectedTunnelId] = useState<string | null>(null)
    const [selectedTunnelIds, setSelectedTunnelIds] = useState<string[]>([])
    const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([])
    const [pageError, setPageError] = useState('')
    const [copiedTunnelId, setCopiedTunnelId] = useState<string | null>(null)
    const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
    const [commandState, setCommandState] = useState<TunnelCommandState | null>(null)
    const [commandLoading, setCommandLoading] = useState(false)
    const [commandError, setCommandError] = useState('')

    const [tunnelModalOpen, setTunnelModalOpen] = useState(false)
    const [routeModalOpen, setRouteModalOpen] = useState(false)
    const [tunnelForm, setTunnelForm] = useState<TunnelForm>(EMPTY_TUNNEL_FORM)
    const [routeForm, setRouteForm] = useState<RouteForm>(EMPTY_ROUTE_FORM)
    const [formError, setFormError] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [confirmState, setConfirmState] = useState<ConfirmState>(null)
    const itemsPerPage = 10

    const selectedTunnel = tunnels.find((item) => item.id === selectedTunnelId) ?? null

    const filteredTunnels = tunnels.filter((tunnel) => {
        if (!searchQuery.trim()) return true
        const keyword = searchQuery.trim().toLowerCase()
        return (
            tunnel.id.toLowerCase().includes(keyword) ||
            tunnel.name.toLowerCase().includes(keyword) ||
            (tunnel.owner_id ?? '').toLowerCase().includes(keyword) ||
            (tunnel.project_key ?? '').toLowerCase().includes(keyword) ||
            tunnel.tunnel_routes.some((route) => route.hostname.toLowerCase().includes(keyword))
        )
    })

    const totalPages = Math.max(1, Math.ceil(filteredTunnels.length / itemsPerPage))
    const currentPageSafe = Math.min(currentPage, totalPages)
    const paginatedTunnels = filteredTunnels.slice((currentPageSafe - 1) * itemsPerPage, currentPageSafe * itemsPerPage)

    const loadData = async (preferredTunnelId?: string | null) => {
        setPageError('')
        const { data: authData } = await supabase.auth.getUser()
        const user = authData.user
        if (!user) {
            setIsAdmin(false)
            setTunnels([])
            setSelectedTunnelId(null)
            setPageError('当前未登录，无法读取隧道数据。')
            return
        }

        const { data: profile, error: profileError } = await supabase
            .from('tunnel_profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profileError) {
            setPageError(profileError.message)
            setIsAdmin(false)
            return
        }

        const admin = profile?.role === 'admin' || profile?.role === 'super_admin'
        setIsAdmin(admin)
        if (!admin) {
            setPageError('当前账号不是 admin / super_admin。')
            setTunnels([])
            setSelectedTunnelId(null)
            return
        }

        const { data, error } = await supabase
            .from('tunnel_instances')
            .select(`
                id, name, status, created_at, updated_at, token_hash, owner_id, project_key, client_ip, os_type,
                tunnel_routes ( id, tunnel_id, hostname, target, is_enabled )
            `)
            .order('created_at', { ascending: false })

        if (error) {
            setPageError(error.message)
            return
        }

        const nextTunnels = (data ?? []).map(normalizeTunnel)
        setTunnels(nextTunnels)

        const preferred = preferredTunnelId ?? selectedTunnelId
        const nextSelected = preferred && nextTunnels.some((item) => item.id === preferred)
            ? preferred
            : (nextTunnels[0]?.id ?? null)
        setSelectedTunnelId(nextSelected)
        setSelectedTunnelIds((prev) => prev.filter((id) => nextTunnels.some((item) => item.id === id)))
        setSelectedRouteIds((prev) => {
            const routes = nextTunnels.find((item) => item.id === nextSelected)?.tunnel_routes ?? []
            return prev.filter((id) => routes.some((route) => route.id === id))
        })
    }

    useEffect(() => {
        let active = true
        ;(async () => {
            setLoading(true)
            try {
                if (active) {
                    await loadData()
                }
            } finally {
                if (active) setLoading(false)
            }
        })()
        return () => {
            active = false
        }
        // Initial load only. Subsequent reloads use refresh().
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages))
    }, [totalPages])

    useEffect(() => {
        setSelectedRouteIds([])
    }, [selectedTunnelId])

    useEffect(() => {
        if (!selectedTunnelId) {
            setCommandState(null)
            setCommandError('')
            return
        }

        let active = true
        ;(async () => {
            setCommandLoading(true)
            setCommandError('')
            try {
                const response = await fetch(`/api/admin/tunnels/${selectedTunnelId}/command`, { cache: 'no-store' })
                const data = await response.json().catch(() => ({}))
                if (!response.ok) {
                    throw new Error(data.error ?? '加载命令失败')
                }
                if (active) {
                    setCommandState(data)
                }
            } catch (error) {
                if (active) {
                    setCommandState(null)
                    setCommandError(error instanceof Error ? error.message : '加载命令失败')
                }
            } finally {
                if (active) setCommandLoading(false)
            }
        })()

        return () => {
            active = false
        }
    }, [selectedTunnelId])

    async function refresh(preferredTunnelId?: string | null) {
        setRefreshing(true)
        try {
            await loadData(preferredTunnelId)
        } finally {
            setRefreshing(false)
        }
    }

    function openCreateTunnel() {
        setTunnelForm({
            ...EMPTY_TUNNEL_FORM,
            token_hash: createTokenSeed(),
        })
        setFormError('')
        setTunnelModalOpen(true)
    }

    function openEditTunnel(tunnel: Tunnel) {
        setTunnelForm({
            id: tunnel.id,
            name: tunnel.name,
            token_hash: tunnel.token_hash,
            owner_id: tunnel.owner_id ?? '',
            project_key: tunnel.project_key ?? '',
            status: tunnel.status,
            client_ip: tunnel.client_ip ?? '',
            os_type: tunnel.os_type ?? '',
        })
        setFormError('')
        setTunnelModalOpen(true)
    }

    function openCreateRoute() {
        if (!selectedTunnel) return
        setRouteForm({
            ...EMPTY_ROUTE_FORM,
            tunnel_id: selectedTunnel.id,
        })
        setFormError('')
        setRouteModalOpen(true)
    }

    function openEditRoute(route: TunnelRoute) {
        setRouteForm({
            id: route.id,
            tunnel_id: route.tunnel_id,
            hostname: route.hostname,
            target: route.target,
            is_enabled: route.is_enabled,
        })
        setFormError('')
        setRouteModalOpen(true)
    }

    async function submitTunnelForm() {
        setSubmitting(true)
        setFormError('')
        try {
            const method = tunnelForm.id ? 'PATCH' : 'POST'
            const url = tunnelForm.id ? `/api/admin/tunnels/${tunnelForm.id}` : '/api/admin/tunnels'
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tunnelForm),
            })
            const data = await response.json()
            if (!response.ok) {
                setFormError(data.error ?? '保存 tunnel 失败')
                return
            }
            setTunnelModalOpen(false)
            await refresh(tunnelForm.id ?? data.tunnel?.id ?? selectedTunnelId)
        } catch {
            setFormError('网络错误，请稍后重试')
        } finally {
            setSubmitting(false)
        }
    }

    async function submitRouteForm() {
        setSubmitting(true)
        setFormError('')
        try {
            const method = routeForm.id ? 'PATCH' : 'POST'
            const url = routeForm.id ? `/api/admin/routes/${routeForm.id}` : '/api/admin/routes'
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(routeForm),
            })
            const data = await response.json()
            if (!response.ok) {
                setFormError(data.error ?? '保存 route 失败')
                return
            }
            setRouteModalOpen(false)
            await refresh(routeForm.tunnel_id)
        } catch {
            setFormError('网络错误，请稍后重试')
        } finally {
            setSubmitting(false)
        }
    }

    async function updateRoute(routeId: string, patch: Partial<RouteForm>) {
        setPageError('')
        const response = await fetch(`/api/admin/routes/${routeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        })
        const data = await response.json()
        if (!response.ok) {
            throw new Error(data.error ?? '更新 route 失败')
        }
    }

    async function deleteSingleRoute(routeId: string) {
        const response = await fetch(`/api/admin/routes/${routeId}`, {
            method: 'DELETE',
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
            throw new Error(data.error ?? '删除 route 失败')
        }
        await refresh(selectedTunnelId)
    }

    async function deleteSingleTunnel(tunnelId: string) {
        const response = await fetch(`/api/admin/tunnels/${tunnelId}`, {
            method: 'DELETE',
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
            throw new Error(data.error ?? '删除 tunnel 失败')
        }
        await refresh(selectedTunnelId === tunnelId ? null : selectedTunnelId)
    }

    async function bulkDelete(kind: 'tunnels' | 'routes', ids: string[]) {
        const url = kind === 'tunnels' ? '/api/admin/tunnels' : '/api/admin/routes'
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
            throw new Error(data.error ?? '批量删除失败')
        }
        if (kind === 'tunnels') {
            setSelectedTunnelIds([])
            await refresh(null)
        } else {
            setSelectedRouteIds([])
            await refresh(selectedTunnelId)
        }
    }

    function toggleTunnelSelection(tunnelId: string) {
        setSelectedTunnelIds((prev) => (prev.includes(tunnelId) ? prev.filter((id) => id !== tunnelId) : [...prev, tunnelId]))
    }

    function toggleRouteSelection(routeId: string) {
        setSelectedRouteIds((prev) => (prev.includes(routeId) ? prev.filter((id) => id !== routeId) : [...prev, routeId]))
    }

    function copyTunnelId(id: string) {
        navigator.clipboard.writeText(id)
        setCopiedTunnelId(id)
        setTimeout(() => setCopiedTunnelId(null), 1200)
    }

    function copyCommand(kind: 'agent' | 'docker', value: string) {
        navigator.clipboard.writeText(value)
        setCopiedCommand(kind)
        setTimeout(() => setCopiedCommand(null), 1200)
    }

    async function runAction(action: () => Promise<void>) {
        setSubmitting(true)
        setPageError('')
        try {
            await action()
            setConfirmState(null)
        } catch (error) {
            setPageError(error instanceof Error ? error.message : '操作失败')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="flex-1 flex flex-col gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Server className="h-6 w-6 text-indigo-600 mr-2" />
                        Tunnel Admin
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">超管平台统一管理 Tunnel / Route，支持新增、编辑、单删和批量一键删除。</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => refresh(selectedTunnelId)}
                        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        刷新
                    </button>
                    <button
                        onClick={openCreateTunnel}
                        className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        新建 Tunnel
                    </button>
                </div>
            </div>

            {isAdmin && (
                <div className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0 text-purple-600" />
                    <span>当前为管理员视图，增删改查都会直接作用于全部 tunnel 和 route 数据。</span>
                </div>
            )}

            {pageError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {pageError}
                </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.9fr)]">
                <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-b border-gray-200 bg-gray-50/70 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="relative w-full max-w-md">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={searchQuery}
                                    onChange={(event) => {
                                        setSearchQuery(event.target.value)
                                        setCurrentPage(1)
                                    }}
                                    placeholder="按 Tunnel ID / 名称 / 域名搜索"
                                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-indigo-500"
                                />
                            </div>
                            {selectedTunnelIds.length > 0 && (
                                <button
                                    onClick={() =>
                                        setConfirmState({
                                            title: `删除 ${selectedTunnelIds.length} 个 Tunnel？`,
                                            description: '会连带删除这些 tunnel 下的全部 route，操作不可恢复。',
                                            action: () => bulkDelete('tunnels', selectedTunnelIds),
                                        })
                                    }
                                    className="inline-flex items-center rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    批量删除 Tunnel
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="overflow-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left">
                                        <input
                                            type="checkbox"
                                            checked={paginatedTunnels.length > 0 && paginatedTunnels.every((item) => selectedTunnelIds.includes(item.id))}
                                            onChange={(event) => {
                                                if (event.target.checked) {
                                                    setSelectedTunnelIds(Array.from(new Set([...selectedTunnelIds, ...paginatedTunnels.map((item) => item.id)])))
                                                } else {
                                                    setSelectedTunnelIds((prev) => prev.filter((id) => !paginatedTunnels.some((item) => item.id === id)))
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tunnel</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Owner / Project</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Routes</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Created</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {paginatedTunnels.map((tunnel) => (
                                    <tr
                                        key={tunnel.id}
                                        className={`cursor-pointer transition-colors hover:bg-indigo-50/60 ${selectedTunnelId === tunnel.id ? 'bg-indigo-50/70' : ''}`}
                                        onClick={() => setSelectedTunnelId(tunnel.id)}
                                    >
                                        <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedTunnelIds.includes(tunnel.id)}
                                                onChange={() => toggleTunnelSelection(tunnel.id)}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tunnel.status === 'online' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                                    <Server className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900">{tunnel.name}</div>
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            copyTunnelId(tunnel.id)
                                                        }}
                                                        className="mt-1 inline-flex items-center gap-1 text-xs font-mono text-gray-500 hover:text-indigo-600"
                                                    >
                                                        {tunnel.id}
                                                        {copiedTunnelId === tunnel.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600">
                                            <div className="font-mono text-xs">{tunnel.owner_id || '—'}</div>
                                            <div className="mt-1 text-xs text-indigo-600">{tunnel.project_key || '—'}</div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tunnel.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {tunnel.status === 'online' ? 'Online' : 'Offline'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600">{routeCount(tunnel)}</td>
                                        <td className="px-4 py-4 text-sm text-gray-600">{formatDate(tunnel.created_at)}</td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                                                <button
                                                    onClick={() => openEditTunnel(tunnel)}
                                                    className="rounded-lg p-2 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600"
                                                    title="编辑 tunnel"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setConfirmState({
                                                            title: '删除 Tunnel？',
                                                            description: `会永久删除 ${tunnel.name} 以及其下全部路由。`,
                                                            action: () => deleteSingleTunnel(tunnel.id),
                                                        })
                                                    }
                                                    className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                                                    title="删除 tunnel"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {!loading && paginatedTunnels.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-16 text-center text-sm text-gray-500">
                                            没有匹配的 tunnel 记录。
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-500">
                        <span>共 {filteredTunnels.length} 条，当前第 {currentPageSafe} / {totalPages} 页</span>
                        <div className="flex items-center gap-2">
                            <button
                                disabled={currentPageSafe <= 1}
                                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                上一页
                            </button>
                            <button
                                disabled={currentPageSafe >= totalPages}
                                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                下一页
                            </button>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                    {selectedTunnel ? (
                        <>
                            <div className="border-b border-gray-200 p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">{selectedTunnel.name}</h2>
                                        <p className="mt-1 text-xs font-mono text-gray-500">{selectedTunnel.id}</p>
                                    </div>
                                    <button
                                        onClick={() => openEditTunnel(selectedTunnel)}
                                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        编辑 Tunnel
                                    </button>
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                        <div className="text-xs text-gray-500">Owner</div>
                                        <div className="mt-1 font-mono text-sm text-gray-800">{selectedTunnel.owner_id || '—'}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                        <div className="text-xs text-gray-500">Project</div>
                                        <div className="mt-1 text-sm text-gray-800">{selectedTunnel.project_key || '—'}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                        <div className="text-xs text-gray-500">Client IP</div>
                                        <div className="mt-1 font-mono text-sm text-gray-800">{selectedTunnel.client_ip || '—'}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                        <div className="text-xs text-gray-500">Device</div>
                                        <div className="mt-1 text-sm text-gray-800">{selectedTunnel.os_type || '—'}</div>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900">启动命令</h3>
                                            <p className="mt-1 text-xs text-gray-500">超管手动新增 tunnel 后，可以直接复制以下命令到目标机器执行。后续 route 由平台继续管理。</p>
                                        </div>
                                        {commandLoading && <div className="text-xs text-gray-500">加载中...</div>}
                                    </div>

                                    {commandError && (
                                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                                            {commandError}
                                        </div>
                                    )}

                                    {commandState && (
                                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                            <div className="rounded-xl border border-white bg-white p-3 shadow-sm">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-sm font-medium text-gray-900">Agent Command</div>
                                                    <button
                                                        onClick={() => copyCommand('agent', commandState.agent_command)}
                                                        className="inline-flex items-center rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                                                        {copiedCommand === 'agent' ? '已复制' : '复制'}
                                                    </button>
                                                </div>
                                                <pre className="mt-3 overflow-auto rounded-lg bg-gray-950 p-3 text-xs leading-6 text-gray-100">
                                                    <code>{commandState.agent_command}</code>
                                                </pre>
                                            </div>

                                            <div className="rounded-xl border border-white bg-white p-3 shadow-sm">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-sm font-medium text-gray-900">Docker Command</div>
                                                    <button
                                                        onClick={() => copyCommand('docker', commandState.docker_command)}
                                                        className="inline-flex items-center rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                                                        {copiedCommand === 'docker' ? '已复制' : '复制'}
                                                    </button>
                                                </div>
                                                <pre className="mt-3 overflow-auto rounded-lg bg-gray-950 p-3 text-xs leading-6 text-gray-100">
                                                    <code>{commandState.docker_command}</code>
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-5">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Routes</h3>
                                        <p className="text-sm text-gray-500">当前 tunnel 下共 {routeCount(selectedTunnel)} 条路由。</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        {selectedRouteIds.length > 0 && (
                                            <button
                                                onClick={() =>
                                                    setConfirmState({
                                                        title: `删除 ${selectedRouteIds.length} 条 Route？`,
                                                        description: '批量删除后不可恢复。',
                                                        action: () => bulkDelete('routes', selectedRouteIds),
                                                    })
                                                }
                                                className="inline-flex items-center rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                批量删除 Route
                                            </button>
                                        )}
                                        <button
                                            onClick={openCreateRoute}
                                            className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            新建 Route
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-hidden rounded-xl border border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTunnel.tunnel_routes.length > 0 && selectedTunnel.tunnel_routes.every((route) => selectedRouteIds.includes(route.id))}
                                                        onChange={(event) => {
                                                            if (event.target.checked) {
                                                                setSelectedRouteIds(selectedTunnel.tunnel_routes.map((route) => route.id))
                                                            } else {
                                                                setSelectedRouteIds([])
                                                            }
                                                        }}
                                                    />
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Hostname</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Target</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">状态</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 bg-white">
                                            {selectedTunnel.tunnel_routes.map((route) => (
                                                <tr key={route.id}>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRouteIds.includes(route.id)}
                                                            onChange={() => toggleRouteSelection(route.id)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-mono text-sm text-indigo-600">{route.hostname}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-mono text-sm text-gray-600">{route.target}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            onClick={async () => {
                                                                setSubmitting(true)
                                                                setPageError('')
                                                                try {
                                                                    await updateRoute(route.id, { is_enabled: !route.is_enabled })
                                                                    await refresh(selectedTunnel.id)
                                                                } catch (error) {
                                                                    setPageError(error instanceof Error ? error.message : '更新 route 失败')
                                                                } finally {
                                                                    setSubmitting(false)
                                                                }
                                                            }}
                                                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${route.is_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                                                        >
                                                            {route.is_enabled ? '已启用' : '已禁用'}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => openEditRoute(route)}
                                                                className="rounded-lg p-2 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600"
                                                                title="编辑 route"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    setConfirmState({
                                                                        title: '删除 Route？',
                                                                        description: `会永久删除 ${route.hostname}。`,
                                                                        action: () => deleteSingleRoute(route.id),
                                                                    })
                                                                }
                                                                className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                                                                title="删除 route"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {selectedTunnel.tunnel_routes.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                                                        当前 tunnel 还没有 route。
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center">
                            <div>
                                <Server className="mx-auto h-10 w-10 text-gray-300" />
                                <h2 className="mt-4 text-lg font-semibold text-gray-900">选择一个 Tunnel</h2>
                                <p className="mt-2 text-sm text-gray-500">右侧会展示 Route 详情，并支持编辑、新增和批量删除。</p>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {(tunnelModalOpen || routeModalOpen) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {tunnelModalOpen ? (tunnelForm.id ? '编辑 Tunnel' : '新建 Tunnel') : routeForm.id ? '编辑 Route' : '新建 Route'}
                                </h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    {tunnelModalOpen ? '修改 tunnel 基本信息和 token。' : '修改对外 hostname、目标地址和启用状态。'}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setTunnelModalOpen(false)
                                    setRouteModalOpen(false)
                                    setFormError('')
                                }}
                                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-4 px-6 py-5">
                            {formError && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {formError}
                                </div>
                            )}

                            {tunnelModalOpen ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
                                        <input
                                            value={tunnelForm.name}
                                            onChange={(event) => setTunnelForm((prev) => ({ ...prev, name: event.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Token</span>
                                        <input
                                            value={tunnelForm.token_hash}
                                            onChange={(event) => setTunnelForm((prev) => ({ ...prev, token_hash: event.target.value }))}
                                            placeholder="留空则由后端生成"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Owner ID</span>
                                        <input
                                            value={tunnelForm.owner_id}
                                            onChange={(event) => setTunnelForm((prev) => ({ ...prev, owner_id: event.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Project Key</span>
                                        <input
                                            value={tunnelForm.project_key}
                                            onChange={(event) => setTunnelForm((prev) => ({ ...prev, project_key: event.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Status</span>
                                        <select
                                            value={tunnelForm.status}
                                            onChange={(event) => setTunnelForm((prev) => ({ ...prev, status: event.target.value as 'online' | 'offline' }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        >
                                            <option value="offline">offline</option>
                                            <option value="online">online</option>
                                        </select>
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Device</span>
                                        <input
                                            value={tunnelForm.os_type}
                                            onChange={(event) => setTunnelForm((prev) => ({ ...prev, os_type: event.target.value }))}
                                            placeholder="mac / linux / windows"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        />
                                    </label>
                                    <label className="block md:col-span-2">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Client IP</span>
                                        <input
                                            value={tunnelForm.client_ip}
                                            onChange={(event) => setTunnelForm((prev) => ({ ...prev, client_ip: event.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        />
                                    </label>
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block md:col-span-2">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Tunnel ID</span>
                                        <input
                                            value={routeForm.tunnel_id}
                                            onChange={(event) => setRouteForm((prev) => ({ ...prev, tunnel_id: event.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                            disabled={Boolean(routeForm.id)}
                                        />
                                    </label>
                                    <label className="block md:col-span-2">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Hostname</span>
                                        <input
                                            value={routeForm.hostname}
                                            onChange={(event) => setRouteForm((prev) => ({ ...prev, hostname: event.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                        />
                                    </label>
                                    <label className="block md:col-span-2">
                                        <span className="mb-1 block text-sm font-medium text-gray-700">Target</span>
                                        <input
                                            value={routeForm.target}
                                            onChange={(event) => setRouteForm((prev) => ({ ...prev, target: event.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                        />
                                    </label>
                                    <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 md:col-span-2">
                                        <input
                                            type="checkbox"
                                            checked={routeForm.is_enabled}
                                            onChange={(event) => setRouteForm((prev) => ({ ...prev, is_enabled: event.target.checked }))}
                                        />
                                        <span className="text-sm text-gray-700">创建后立即启用</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
                            <button
                                onClick={() => {
                                    setTunnelModalOpen(false)
                                    setRouteModalOpen(false)
                                    setFormError('')
                                }}
                                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                取消
                            </button>
                            <button
                                disabled={submitting}
                                onClick={() => (tunnelModalOpen ? submitTunnelForm() : submitRouteForm())}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                                {submitting ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmState && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
                        <div className="px-6 py-6">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                                <AlertTriangle className="h-6 w-6 text-red-600" />
                            </div>
                            <h3 className="mt-4 text-center text-lg font-bold text-gray-900">{confirmState.title}</h3>
                            <p className="mt-2 text-center text-sm text-gray-500">{confirmState.description}</p>
                        </div>
                        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-6 py-4">
                            <button
                                onClick={() => setConfirmState(null)}
                                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                取消
                            </button>
                            <button
                                disabled={submitting}
                                onClick={() => runAction(confirmState.action)}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                            >
                                {submitting ? '处理中...' : '确认删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm text-gray-600 shadow-lg">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        正在加载 Tunnel 数据...
                    </div>
                </div>
            )}
        </div>
    )
}
