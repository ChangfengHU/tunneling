'use client'

import { useState, useEffect } from 'react'
import { Plus, Server, XCircle, Search, Settings as SettingsIcon, Trash2, Copy, Play, ShieldAlert } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export default function TunnelsPage() {
    const [selectedTunnel, setSelectedTunnel] = useState<any>(null)
    const [tunnels, setTunnels] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        const init = async () => {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            let admin = false
            if (user) {
                const { data: profile } = await supabase
                    .from('tunnel_profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single()
                admin = profile?.role === 'admin' || profile?.role === 'super_admin'
                setIsAdmin(admin)
            }

            const { data, error } = await supabase
                .from('tunnel_instances')
                .select(`
                    id, name, status, created_at, token_hash, owner_id, project_key,
                    tunnel_routes ( id, hostname, target, is_enabled )
                `)
                .order('created_at', { ascending: false })

            if (!error && data) {
                setTunnels(data.map(t => ({
                    ...t,
                    routes: t.tunnel_routes?.length || 0,
                    tunnel_routes: t.tunnel_routes || [],
                    created_at: new Date(t.created_at).toISOString().split('T')[0]
                })))
            }
            setLoading(false)
        }
        init()
    }, [supabase])

    return (
        <div className="flex-1 flex flex-col h-[calc(100vh-8rem)]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Server className="h-6 w-6 text-indigo-600 mr-2" />
                        Tunnels & Routes
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">Manage your active network tunnels and domain mapping routes.</p>
                </div>
                <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                    <Plus className="h-4 w-4 mr-2" /> New Tunnel
                </button>
            </div>

            {isAdmin && (
                <div className="mb-4 flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2.5 text-sm text-purple-800">
                    <ShieldAlert className="h-4 w-4 text-purple-600 flex-shrink-0" />
                    <span><strong>Admin View</strong> — Showing all tunnels from all users including owner and mapping details.</span>
                </div>
            )}

            <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200 flex-1 flex flex-col">
                <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full sm:w-96">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="Search by ID, name, or domain..."
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm shadow-gray-200/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tunnel</th>
                                {isAdmin && <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner / Project</th>}
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Routes</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tunnels.map((t) => (
                                <tr key={t.id} className="hover:bg-indigo-50/50 transition-colors cursor-pointer group" onClick={() => setSelectedTunnel(t)}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center mr-3 ${t.status === 'online' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                                <Server className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{t.name}</div>
                                                <div className="text-xs font-mono text-gray-500">{t.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    {isAdmin && (
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs font-mono text-gray-600 truncate max-w-[160px]" title={t.owner_id}>{t.owner_id || <span className="text-gray-400">—</span>}</div>
                                            {t.project_key && <div className="text-xs text-indigo-500 truncate max-w-[160px]">{t.project_key}</div>}
                                        </td>
                                    )}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {t.status === 'online' ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                <span className="w-1.5 h-1.5 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Online
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                                <span className="w-1.5 h-1.5 mr-1.5 bg-gray-400 rounded-full"></span> Offline
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <span className="inline-flex items-center font-semibold bg-gray-100 px-2 py-0.5 rounded text-gray-600">{t.routes}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{t.created_at}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={(e) => { e.stopPropagation(); setSelectedTunnel(t) }} className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors flex items-center ml-auto">
                                            <SettingsIcon className="h-4 w-4 mr-1.5" /> Manage
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!loading && tunnels.length === 0 && (
                                <tr>
                                    <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-sm text-gray-500">
                                        <Server className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                        <p className="font-semibold text-gray-900">No tunnels found</p>
                                        <p className="mt-1">Get started by creating a new tunnel from the CLI or dashboard.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Slide-over Drawer */}
            {selectedTunnel && (
                <>
                    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 transition-opacity" onClick={() => setSelectedTunnel(null)}></div>
                    <div className="fixed inset-y-0 right-0 max-w-2xl w-full bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col">
                        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between sticky top-0 z-10">
                            <div className="flex items-center">
                                <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg mr-3 shadow-inner"><Server className="w-5 h-5" /></div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900" id="slide-over-title">{selectedTunnel.name}</h2>
                                    <p className="text-sm font-mono text-gray-500 flex items-center mt-0.5">
                                        {selectedTunnel.id}
                                        <button className="ml-2 text-gray-400 hover:text-indigo-600 transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="bg-white rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" onClick={() => setSelectedTunnel(null)}>
                                <XCircle className="h-6 w-6" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {isAdmin && (selectedTunnel.owner_id || selectedTunnel.project_key) && (
                                <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
                                    <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">Owner Info</h4>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <span className="text-purple-500 text-xs">Owner ID</span>
                                            <p className="font-mono text-gray-800 text-xs break-all">{selectedTunnel.owner_id || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-purple-500 text-xs">Project Key</span>
                                            <p className="font-mono text-gray-800 text-xs break-all">{selectedTunnel.project_key || '—'}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm">
                                <h4 className="text-sm font-bold text-blue-900 mb-2 flex items-center"><Play className="w-4 h-4 mr-1.5" /> Agent Connection Command</h4>
                                <p className="text-sm text-blue-700 mb-3">Run this exact command on your target machine to connect it to this tunnel instance.</p>
                                <div className="relative group">
                                    <pre className="bg-blue-950 text-blue-50 p-3 rounded-lg text-xs font-mono overflow-x-auto border border-blue-800 shadow-inner">agent -server ws://152.32.214.95/connect -tunnel-id {selectedTunnel.id} -tunnel-token {selectedTunnel.token_hash}</pre>
                                    <button className="absolute top-2 right-2 bg-blue-800 hover:bg-blue-700 text-white p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => navigator.clipboard.writeText(`agent -server ws://152.32.214.95/connect -tunnel-id ${selectedTunnel.id} -tunnel-token ${selectedTunnel.token_hash}`)}><Copy className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>

                            <div className="mb-8">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-bold text-gray-900">Routes ({selectedTunnel.routes})</h3>
                                    <button className="text-sm border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-md font-medium shadow-sm transition-colors flex items-center">
                                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Route
                                    </button>
                                </div>

                                <div className="bg-white border text-left border-gray-200 rounded-lg shadow-sm overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Public Hostname</th>
                                                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Target (Local)</th>
                                                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {selectedTunnel.tunnel_routes?.map((route: any) => (
                                                <tr key={route.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-4 py-3 text-sm font-medium text-indigo-600">{route.hostname}</td>
                                                    <td className="px-4 py-3 text-sm font-mono text-gray-600 bg-gray-50 rounded">{route.target}</td>
                                                    <td className="px-4 py-3 text-sm text-right">
                                                        <button className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${route.is_enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${route.is_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!selectedTunnel.tunnel_routes || selectedTunnel.tunnel_routes.length === 0) && (
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-4 text-center text-sm text-gray-500">No routes configured yet.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 bg-gray-50">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-red-800">Danger Zone</h4>
                                    <p className="text-xs text-red-600 mt-1">Permanently delete this tunnel and all associated routes. This action cannot be undone.</p>
                                </div>
                                <button className="flex-shrink-0 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold py-2 px-3 rounded text-center border border-red-300 transition-colors flex items-center">
                                    <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
