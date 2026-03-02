'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, LogIn, AlertCircle } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_CONTROL_API_URL ?? 'http://152.32.214.95:3002/control'

export default function PortalLoginPage() {
    const [tunnelId, setTunnelId] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const router = useRouter()

    useEffect(() => {
        if (localStorage.getItem('portal_tunnel_id')) {
            router.replace('/portal/dashboard')
        }
    }, [router])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const res = await fetch(`${API}/api/portal/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tunnel_id: tunnelId.trim() }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? '找不到该 Tunnel，请确认 ID 是否正确')
                return
            }
            localStorage.setItem('portal_tunnel_id', data.tunnel.id)
            localStorage.setItem('portal_token', data.tunnel.token ?? '')
            localStorage.setItem('portal_tunnel_name', data.tunnel.name ?? '')
            router.push('/portal/dashboard')
        } catch {
            setError('无法连接到服务器，请稍后重试')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="flex items-center justify-center mb-8">
                    <Activity className="h-8 w-8 text-indigo-400 mr-2" />
                    <span className="text-2xl font-bold text-white tracking-tight">Tunnel Portal</span>
                </div>

                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    <div className="mb-6">
                        <h1 className="text-xl font-bold text-gray-900">用户登录</h1>
                        <p className="mt-1 text-sm text-gray-500">输入您的 Tunnel ID，即可查看和管理您的所有域名映射</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tunnel ID</label>
                            <input
                                type="text"
                                value={tunnelId}
                                onChange={e => setTunnelId(e.target.value)}
                                required
                                autoFocus
                                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition"
                            />
                            <p className="mt-1 text-xs text-gray-400">您的 Tunnel ID 由管理员或 CLI 工具提供</p>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !tunnelId.trim()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold rounded-lg transition"
                        >
                            {loading ? (
                                <span className="animate-spin border-2 border-white border-t-transparent rounded-full h-4 w-4" />
                            ) : (
                                <LogIn className="h-4 w-4" />
                            )}
                            {loading ? '登录中…' : '进入我的映射'}
                        </button>
                    </form>

                    <div className="mt-6 pt-5 border-t border-gray-100 text-xs text-gray-400">
                        <p>💡 Tunnel ID 在您第一次运行 agent 命令后会显示在终端，或由管理员分配给您。</p>
                    </div>
                </div>

                <p className="mt-6 text-center text-xs text-indigo-300">
                    管理员？<a href="/login" className="underline hover:text-white ml-1">前往管理后台 →</a>
                </p>
            </div>
        </div>
    )
}
