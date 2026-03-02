'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Network, Users, Settings, LogOut, Activity } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function Sidebar({
    user,
    profile,
}: {
    user: any
    profile: any
}) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="bg-indigo-900 shadow-xl text-white w-64 flex-shrink-0 flex flex-col transition-all duration-300 relative z-10">
            <div className="h-16 flex items-center px-6 bg-indigo-950 border-b border-indigo-800">
                <Activity className="h-7 w-7 text-indigo-400 mr-2" />
                <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">
                    Tunnel Console
                </span>
            </div>

            <div className="flex-1 overflow-y-auto py-6">
                <div className="px-4 mb-3 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                    Main
                </div>
                <nav className="px-3 space-y-1">
                    <Link
                        href="/dashboard"
                        className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${pathname === '/dashboard'
                                ? 'bg-indigo-800 shadow-inner text-white'
                                : 'text-indigo-100 hover:bg-indigo-800/80 hover:text-white'
                            }`}
                    >
                        <LayoutDashboard className="text-indigo-300 mr-3 h-5 w-5" />
                        Dashboard
                    </Link>
                    <Link
                        href="/dashboard/tunnels"
                        className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${pathname?.startsWith('/dashboard/tunnels')
                                ? 'bg-indigo-800 shadow-inner text-white'
                                : 'text-indigo-100 hover:bg-indigo-800/80 hover:text-white'
                            }`}
                    >
                        <Network className="text-indigo-300 mr-3 h-5 w-5" />
                        Tunnels & Routes
                    </Link>
                </nav>

                {isAdmin && (
                    <>
                        <div className="px-4 mt-8 mb-3 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                            Administration
                        </div>
                        <nav className="px-3 space-y-1">
                            <Link
                                href="/dashboard/users"
                                className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${pathname?.startsWith('/dashboard/users')
                                        ? 'bg-indigo-800 shadow-inner text-white'
                                        : 'text-indigo-100 hover:bg-indigo-800/80 hover:text-white'
                                    }`}
                            >
                                <Users className="text-indigo-300 mr-3 h-5 w-5" />
                                Users Management
                            </Link>
                            <Link
                                href="/dashboard/settings"
                                className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${pathname?.startsWith('/dashboard/settings')
                                        ? 'bg-indigo-800 shadow-inner text-white'
                                        : 'text-indigo-100 hover:bg-indigo-800/80 hover:text-white'
                                    }`}
                            >
                                <Settings className="text-indigo-300 mr-3 h-5 w-5" />
                                Global Settings
                            </Link>
                        </nav>
                    </>
                )}
            </div>

            <div className="flex-shrink-0 flex bg-indigo-950 p-4 border-t border-indigo-800">
                <button
                    onClick={handleSignOut}
                    className="flex-shrink-0 w-full group block text-left"
                >
                    <div className="flex items-center">
                        <div className="relative">
                            <img
                                className="inline-block h-10 w-10 rounded-full border-2 border-indigo-500 shadow-sm"
                                src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${profile?.full_name || user.email}&background=4f46e5&color=fff`}
                                alt=""
                            />
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-indigo-950 bg-green-400"></span>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm font-medium text-white group-hover:text-indigo-200 transition-colors truncate w-32">
                                {profile?.full_name || user.email}
                            </p>
                            <p className="text-xs font-medium text-indigo-400 flex items-center">
                                <LogOut className="h-3 w-3 mr-1" />
                                Sign out
                            </p>
                        </div>
                    </div>
                </button>
            </div>
        </div>
    )
}
