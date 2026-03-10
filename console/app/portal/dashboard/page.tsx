'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    Activity, Network, LogOut, Check, X, Edit2, Loader2,
    Copy, AlertCircle, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_CONTROL_API_URL ?? 'http://152.32.214.95:3002/control'

type Route = {
    id: string
    tunnel_id: string
    hostname: string
    target: string
    is_enabled: boolean
    created_at: string
}

type TunnelInfo = {
    id: string
    name: string
}

export default function PortalDashboardPage() {
    return (
        <Suspense>
            <PortalDashboardContent />
        </Suspense>
    )
}

function PortalDashboardContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [tunnel, setTunnel] = useState<TunnelInfo | null>(null)
    const [routes, setRoutes] = useState<Route[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Inline hostname editing state
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValue, setEditValue] = useState('')
    const [editError, setEditError] = useState('')
    const [savingId, setSavingId] = useState<string | null>(null)

    // Copied feedback
    const [copied, setCopied] = useState(false)

    const credentials = useCallback(() => {
        if (typeof window === 'undefined') return { tunnelId: '', token: '' }
        return {
            tunnelId: localStorage.getItem('portal_tunnel_id') ?? '',
            token: localStorage.getItem('portal_token') ?? '',
        }
    }, [])

    const fetchRoutes = useCallback(async () => {
        const { tunnelId, token } = credentials()
        if (!tunnelId) {
            router.replace('/login')
            return
        }
        setLoading(true)
        setError('')
        try {
            const res = await fetch(`${API}/api/portal/routes?tunnel_id=${encodeURIComponent(tunnelId)}`)
            const data = await res.json()
            if (!res.ok) {
                if (res.status === 404) { router.replace('/login'); return }
                setError(data.error ?? '加载失败')
                return
            }
            setRoutes(data.routes ?? [])
            setTunnel({ id: tunnelId, name: localStorage.getItem('portal_tunnel_name') ?? tunnelId })
        } catch {
            setError('无法连接到服务器')
        } finally {
            setLoading(false)
        }
    }, [credentials, router])

    useEffect(() => {
        const tunnelIdParam = searchParams.get('tunnel_id')
        if (tunnelIdParam) {
            // Came from /login server action — call login API to get token, then save to localStorage
            fetch(`${API}/api/portal/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tunnel_id: tunnelIdParam }),
            })
                .then(r => r.json())
                .then(data => {
                    if (data.tunnel) {
                        localStorage.setItem('portal_tunnel_id', data.tunnel.id)
                        localStorage.setItem('portal_token', data.tunnel.token ?? '')
                        localStorage.setItem('portal_tunnel_name', data.tunnel.name ?? '')
                    }
                    // Remove query param then load routes
                    router.replace('/portal/dashboard')
                    fetchRoutes()
                })
                .catch(() => router.replace('/login'))
            return
        }
        const { tunnelId } = credentials()
        if (!tunnelId) { router.replace('/login'); return }
        fetchRoutes()
    }, [searchParams, fetchRoutes, credentials, router])

    const handleLogout = () => {
        localStorage.removeItem('portal_tunnel_id')
        localStorage.removeItem('portal_token')
        localStorage.removeItem('portal_tunnel_name')
        router.replace('/login')
    }

    const startEdit = (route: Route) => {
        setEditingId(route.id)
        setEditValue(route.hostname)
        setEditError('')
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditValue('')
        setEditError('')
    }

    const saveHostname = async (routeId: string) => {
        const { tunnelId, token } = credentials()
        const newHostname = editValue.trim()
        if (!newHostname) { setEditError('域名不能为空'); return }

        setSavingId(routeId)
        setEditError('')
        try {
            const res = await fetch(`${API}/api/portal/routes/${routeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tunnel_id: tunnelId, token, hostname: newHostname }),
            })
            const data = await res.json()
            if (!res.ok) {
                setEditError(data.error ?? '保存失败')
                return
            }
            setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, ...data.route } : r))
            setEditingId(null)
        } catch {
            setEditError('网络错误，请重试')
        } finally {
            setSavingId(null)
        }
    }

    const toggleEnabled = async (route: Route) => {
        const { tunnelId, token } = credentials()
        const newEnabled = !route.is_enabled
        // Optimistic update
        setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, is_enabled: newEnabled } : r))
        try {
            const res = await fetch(`${API}/api/portal/routes/${route.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tunnel_id: tunnelId, token, hostname: route.hostname, is_enabled: newEnabled }),
            })
            if (!res.ok) {
                // Revert on failure
                setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, is_enabled: route.is_enabled } : r))
            }
        } catch {
            setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, is_enabled: route.is_enabled } : r))
        }
    }

    const copyId = () => {
        if (!tunnel) return
        navigator.clipboard.writeText(tunnel.id)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-indigo-900 shadow-lg">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center">
                        <Activity className="h-6 w-6 text-indigo-400 mr-2" />
                        <span className="text-lg font-bold text-white">Tunnel Portal</span>
                    </div>
                    <button onClick={handleLogout} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-sm transition">
                        <LogOut className="h-4 w-4" /> 退出登录
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-8">
                {/* Tunnel Info Card */}
                {tunnel && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <Network className="h-5 w-5 text-indigo-500" />
                                    {tunnel.name || 'My Tunnel'}
                                </h1>
                                <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                                    <span className="font-medium text-gray-700">Tunnel ID：</span>
                                    <code className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{tunnel.id}</code>
                                    <button onClick={copyId} className="text-gray-400 hover:text-indigo-600 transition">
                                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                            </div>
                            <button onClick={fetchRoutes} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">
                                <RefreshCw className="h-3.5 w-3.5" /> 刷新
                            </button>
                        </div>

                        {/* Design tip: multi-project usage */}
                        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
                            <strong>💡 多项目使用方式：</strong>每次本地项目启动时，使用下方命令向同一个 Tunnel 添加新路由，所有项目共享您的 Tunnel ID 和 Token，通过不同子域名区分。
                            <pre className="mt-2 bg-blue-900 text-blue-100 rounded p-2 font-mono overflow-x-auto">
{`./agent -server ws://&lt;server&gt;/connect \\
  -tunnel-id ${tunnel.id} -tunnel-token &lt;token&gt; \\
  -target 127.0.0.1:&lt;port&gt; -subdomain &lt;myapp&gt;`}
                            </pre>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                    </div>
                )}

                {/* Routes Table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <h2 className="text-base font-bold text-gray-900">
                            我的映射路由
                            <span className="ml-2 text-sm font-normal text-gray-400">（{routes.length} 条）</span>
                        </h2>
                        <span className="text-xs text-gray-400">点击域名行右侧的编辑按钮可修改二级域名</span>
                    </div>

                    {routes.length === 0 ? (
                        <div className="px-6 py-16 text-center">
                            <Network className="mx-auto h-12 w-12 text-gray-200 mb-3" />
                            <p className="text-gray-500 font-medium">暂无路由</p>
                            <p className="mt-1 text-sm text-gray-400">使用 agent 命令启动本地项目后，路由会自动注册到这里。</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">公网域名（可修改）</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">本地目标</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {routes.map(route => (
                                        <tr key={route.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                {editingId === route.id ? (
                                                    <div className="space-y-1">
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={editValue}
                                                            onChange={e => { setEditValue(e.target.value); setEditError('') }}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') saveHostname(route.id)
                                                                if (e.key === 'Escape') cancelEdit()
                                                            }}
                                                            className="block w-full max-w-sm px-3 py-1.5 border border-indigo-400 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                        {editError && (
                                                            <p className="text-xs text-red-500 flex items-center gap-1">
                                                                <AlertCircle className="h-3 w-3" /> {editError}
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-gray-400">格式：subdomain.your-domain.com，全局唯一</p>
                                                    </div>
                                                ) : (
                                                    <a
                                                        href={`http://${route.hostname}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline font-mono"
                                                    >
                                                        {route.hostname}
                                                    </a>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <code className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono">{route.target}</code>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => toggleEnabled(route)}
                                                    title={route.is_enabled ? '点击禁用' : '点击启用'}
                                                    className="inline-flex items-center gap-1 transition"
                                                >
                                                    {route.is_enabled ? (
                                                        <ToggleRight className="h-6 w-6 text-emerald-500" />
                                                    ) : (
                                                        <ToggleLeft className="h-6 w-6 text-gray-400" />
                                                    )}
                                                    <span className={`text-xs font-medium ${route.is_enabled ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                        {route.is_enabled ? '启用' : '禁用'}
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {editingId === route.id ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => saveHostname(route.id)}
                                                            disabled={savingId === route.id}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-60"
                                                        >
                                                            {savingId === route.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                                            保存
                                                        </button>
                                                        <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition">
                                                            <X className="h-3 w-3" /> 取消
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEdit(route)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition ml-auto"
                                                    >
                                                        <Edit2 className="h-3 w-3" /> 修改域名
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
