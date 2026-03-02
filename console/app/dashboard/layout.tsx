import { type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Menu, Search, Bell } from 'lucide-react'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('tunnel_profiles')
        .select('role, full_name, avatar_url')
        .eq('id', user.id)
        .single()

    return (
        <div className="h-full flex bg-gray-50">
            <Sidebar user={user} profile={profile} />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <header className="glass-panel z-10 shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-6 flex-shrink-0">
                    <div className="flex items-center">
                        <button className="text-gray-500 hover:text-indigo-600 focus:outline-none transition-colors md:hidden">
                            <Menu className="h-6 w-6" />
                        </button>
                        <div className="ml-4 text-sm font-medium text-gray-500 flex items-center">
                            Tunnel Console
                            <span className="text-gray-900 font-semibold ml-2">/ Dashboard</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative items-center hidden md:flex">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                className="block w-64 pl-9 pr-3 py-1.5 border border-gray-300 rounded-full leading-5 bg-gray-50 hover:bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white sm:text-sm text-gray-900 shadow-sm transition-all"
                                placeholder="Search tunnels, routes, users..."
                            />
                        </div>

                        <button className="relative p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-full transition-colors">
                            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                            <Bell className="h-6 w-6" />
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto bg-gray-50 pt-8 pb-12 px-6 lg:px-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
