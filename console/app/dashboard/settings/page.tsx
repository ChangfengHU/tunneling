import { Settings as SettingsIcon, Save } from 'lucide-react'

export default function SettingsPage() {
    return (
        <div className="max-w-4xl">
            <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                <SettingsIcon className="h-6 w-6 text-indigo-600 mr-2" />
                Global Control Settings
            </h1>

            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-8">
                <form className="space-y-8">
                    <div>
                        <h3 className="text-lg leading-6 font-medium text-gray-900 border-b border-gray-200 pb-2">Agent Connectivity</h3>
                        <div className="mt-4 grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-4">
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Default Websocket Port</label>
                                <div className="mt-1 relative rounded-md shadow-sm border border-gray-300 rounded p-2 focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                                    <input type="number" defaultValue="3002" className="block w-full focus:outline-none sm:text-sm text-gray-900 h-full bg-transparent" />
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <div className="relative flex items-start">
                                    <div className="flex items-center h-5">
                                        <input id="auto-generate" name="auto-generate" type="checkbox" defaultChecked className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                                    </div>
                                    <div className="ml-3 text-sm">
                                        <label htmlFor="auto-generate" className="font-medium text-gray-700">Allow users to auto-generate new tunnel instances</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-5 border-t border-gray-200 flex justify-end">
                        <button type="button" className="bg-indigo-600 border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center">
                            <Save className="w-4 h-4 mr-2" />
                            Save Configuration
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
