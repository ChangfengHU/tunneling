import { createClient } from '@/utils/supabase/server'
import { Activity, ShieldCheck, Server, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
    const supabase = createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    const { data: profile, error: profileError } = await supabase
        .from('tunnel_profiles')
        .select('role')
        .eq('id', user?.id ?? '')
        .single()

    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

    const { count: activeTunnelsCount, error: tunnelErr } = await supabase
        .from('tunnel_instances').select('*', { count: 'exact', head: true }).eq('status', 'online')

    const { count: routesCount, error: routeErr } = await supabase
        .from('tunnel_routes').select('*', { count: 'exact', head: true })

    const { count: usersCount } = isAdmin
        ? await supabase.from('tunnel_profiles').select('*', { count: 'exact', head: true })
        : { count: null }

    const { data: recentTunnels } = await supabase
        .from('tunnel_instances')
        .select('id, name, status, created_at, owner_id')
        .order('created_at', { ascending: false })
        .limit(5)

    // Collect any errors for the debug banner
    const errors: string[] = []
    if (authError)   errors.push(`auth: ${authError.message}`)
    if (profileError) errors.push(`profile: ${profileError.message}`)
    if (tunnelErr)   errors.push(`tunnel_instances: ${tunnelErr.message}`)
    if (routeErr)    errors.push(`tunnel_routes: ${routeErr.message}`)

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Service Overview</h1>

            {/* Diagnostic banner — shows DB errors or role issues */}
            {(errors.length > 0 || !isAdmin) && (
                <div className="mb-6 bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm">
                    <div className="flex items-start gap-2 text-amber-800 font-semibold mb-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        数据加载诊断
                    </div>
                    <ul className="space-y-1 text-amber-700 text-xs font-mono">
                        <li>当前用户：{user?.email ?? '未登录'} (id: {user?.id ?? '-'})</li>
                        <li>Profile 角色：{profile?.role ?? '❌ 无 Profile 记录'}</li>
                        <li>isAdmin：{String(isAdmin)}</li>
                        {errors.map((e, i) => <li key={i} className="text-red-600">⚠ {e}</li>)}
                        {errors.length === 0 && !isAdmin && (
                            <li className="text-red-600">
                                ⚠ 当前账号没有 admin/super_admin 权限，请在 Supabase SQL Editor 执行：<br />
                                <code className="bg-amber-100 px-1 rounded">
                                    UPDATE tunnel_profiles SET role=&apos;super_admin&apos; WHERE id=&apos;{user?.id}&apos;;
                                </code>
                            </li>
                        )}
                    </ul>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-gray-500 text-sm font-semibold uppercase tracking-wide">Total Users</span>
                    <span className="text-4xl font-extrabold text-gray-900 mt-2">
                        {isAdmin ? (usersCount ?? '-') : '-'}
                    </span>
                </div>
                <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-sm flex flex-col items-center justify-center bg-indigo-50/30">
                    <span className="text-indigo-600 text-sm font-semibold uppercase tracking-wide">Active Tunnels</span>
                    <span className="text-4xl font-extrabold text-indigo-700 mt-2">{activeTunnelsCount ?? 0}</span>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-gray-500 text-sm font-semibold uppercase tracking-wide">Total Routes</span>
                    <span className="text-4xl font-extrabold text-gray-900 mt-2">{routesCount ?? '-'}</span>
                </div>
                <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm flex flex-col items-center justify-center bg-emerald-50/30">
                    <span className="text-emerald-600 text-sm font-semibold uppercase tracking-wide">System Status</span>
                    <span className="text-xl font-bold text-emerald-700 mt-4 flex items-center">
                        <ShieldCheck className="w-5 h-5 mr-2" /> All Systems Operational
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white border text-left border-gray-200 shadow-sm rounded-xl p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Recently Active Tunnels</h3>
                    <div className="space-y-2">
                        {recentTunnels && recentTunnels.length > 0 ? (
                            recentTunnels.map((t) => (
                                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                    <div className="flex items-center">
                                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center mr-3 ${t.status === 'online' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                            <Server className="h-3.5 w-3.5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                                            <p className="text-xs font-mono text-gray-400">{t.id}</p>
                                        </div>
                                    </div>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {t.status ?? 'offline'}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-gray-500 italic">No tunnels registered yet.</p>
                        )}
                    </div>
                    <Link href="/dashboard/tunnels" className="block mt-4 text-sm text-indigo-600 font-medium hover:text-indigo-800 w-full text-center py-2">
                        View all tunnels &rarr;
                    </Link>
                </div>

                <div className="bg-gray-900 border text-left border-gray-800 shadow-sm rounded-xl p-6 flex flex-col">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <Activity className="h-4 w-4 text-green-500 mr-2 animate-pulse" />
                        Global Audit Stream
                    </h3>
                    <div className="flex-1 bg-black/50 rounded-lg p-4 font-mono text-xs text-gray-400 space-y-2 overflow-y-auto max-h-[250px]">
                        <div><span className="text-blue-400">[INFO]</span> Admin created new user &apos;guest&apos;</div>
                        <div><span className="text-green-400">[CONN]</span> System initialized</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
