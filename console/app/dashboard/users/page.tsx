import { Users, ShieldCheck, Mail } from 'lucide-react'

export default function UsersPage() {
    const users = [
        { id: 'usr_01', name: 'Admin User', email: 'admin@example.com', role: 'super_admin', tunnels: 5 },
        { id: 'usr_02', name: 'John Doe', email: 'john@example.com', role: 'user', tunnels: 1 },
    ]

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                <Users className="h-6 w-6 text-indigo-600 mr-2" />
                User Management
            </h1>

            <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tunnels</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((u) => (
                            <tr key={u.id} className="hover:bg-indigo-50/50">
                                <td className="px-6 py-4 whitespace-nowrap flex items-center">
                                    <div className="h-10 w-10 flex-shrink-0">
                                        <img className="h-10 w-10 rounded-full" src={`https://ui-avatars.com/api/?name=${u.name}&background=random`} alt="" />
                                    </div>
                                    <div className="ml-4">
                                        <div className="text-sm font-medium text-gray-900">{u.name}</div>
                                        <div className="text-sm text-gray-500 flex items-center"><Mail className="w-3 h-3 mr-1" />{u.email}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                                        {u.role === 'super_admin' && <ShieldCheck className="w-3 h-3 mr-1" />}
                                        {u.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.tunnels}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md">Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
