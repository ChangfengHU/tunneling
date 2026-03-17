import Link from 'next/link'
import { FileText, KeyRound, PlugZap, TerminalSquare, Waypoints, WandSparkles } from 'lucide-react'

const base = 'https://domain.vyibc.com'

const coreApis = [
    {
        method: 'POST',
        path: '/api/sessions/register',
        desc: '注册本地服务并分配公网域名，接入方最核心的接口。',
    },
    {
        method: 'GET',
        path: '/api/tunnels/:id',
        desc: '查询 tunnel 状态，判断 agent 是否在线。',
    },
    {
        method: 'GET',
        path: '/_tunnel/agent/routes',
        desc: 'agent 自动轮询拉取 route 配置，排查路由下发时使用。',
    },
]

const normalRegister = `curl -X POST '${base}/api/sessions/register' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "user_id": "alice",
    "project": "myapp",
    "target": "127.0.0.1:3000",
    "base_domain": "vyibc.com"
  }'`

const overrideRegister = `curl -X POST '${base}/api/sessions/register' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_ADMIN_KEY' \\
  -d '{
    "user_id": "alice",
    "project": "myapp",
    "subdomain": "myapp",
    "target": "127.0.0.1:3001",
    "base_domain": "vyibc.com"
  }'`

const reuseTunnelRegister = `curl -X POST '${base}/api/sessions/register' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "user_id": "alice",
    "project": "admin",
    "subdomain": "admin",
    "target": "127.0.0.1:3001",
    "base_domain": "vyibc.com",
    "tunnel_id": "68bb4bf9-9a6f-4e21-8aa5-3cfb7dc1cfcb",
    "tunnel_token": "dHGAFkpuQx610ShnxCqwbBoJFGHj5y70EDv7RsN26Ds"
  }'`

const registerResponse = `{
  "public_url": "https://myapp.vyibc.com",
  "tunnel": {
    "id": "68bb4bf9-9a6f-4e21-8aa5-3cfb7dc1cfcb",
    "token": "dHGAFkpuQx610ShnxCqwbBoJFGHj5y70EDv7RsN26Ds"
  },
  "route": {
    "hostname": "myapp.vyibc.com",
    "target": "127.0.0.1:3000",
    "is_enabled": true
  },
  "agent_command": "./agent -server ws://domain.vyibc.com/connect -token ... -config ~/.tunneling/machine-agent/config.json",
  "message": "session registered"
}`

const skillInstall = `bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh)`
const skillPrompt = `给我的 myapp 项目分配一个公网域名，它在 localhost:3000 运行`

function MethodBadge({ method }: { method: string }) {
    const styles: Record<string, string> = {
        GET: 'border-blue-200 bg-blue-100 text-blue-700',
        POST: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    }

    return (
        <span className={`inline-flex min-w-16 justify-center rounded-full border px-2.5 py-1 text-xs font-bold ${styles[method] ?? 'border-gray-200 bg-gray-100 text-gray-700'}`}>
            {method}
        </span>
    )
}

function CodeBlock({ code, tone = 'emerald' }: { code: string; tone?: 'emerald' | 'sky' | 'amber' | 'fuchsia' }) {
    const tones = {
        emerald: 'text-emerald-100',
        sky: 'text-sky-100',
        amber: 'text-amber-50',
        fuchsia: 'text-fuchsia-50',
    }

    return (
        <pre className={`overflow-auto rounded-2xl bg-black/50 p-4 text-xs leading-6 ${tones[tone]}`}>
            <code>{code}</code>
        </pre>
    )
}

export default function PublicApiDocsPage() {
    return (
        <main className="min-h-screen bg-slate-950 text-white">
            <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
                <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
                    <div className="flex items-center gap-3 text-indigo-300">
                        <FileText className="h-6 w-6" />
                        <span className="text-sm font-semibold uppercase tracking-[0.2em]">Public Integration Docs</span>
                    </div>
                    <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">本地服务接入文档</h1>
                    <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
                        面向免登录接入方用户。目标场景是：用户本地已经有一个服务，希望通过我们的平台申请一个公网域名，并接入 tunnel 通道。
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3 text-sm">
                        <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-emerald-200">统一接入地址：{base}</div>
                        <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">免登录查看</div>
                        <Link href="/login" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200 hover:bg-white/10">
                            返回登录页
                        </Link>
                    </div>
                </section>

                <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-3xl border border-indigo-400/20 bg-indigo-400/10 p-6">
                        <h2 className="flex items-center text-xl font-bold text-white">
                            <Waypoints className="mr-2 h-5 w-5 text-indigo-300" />
                            接入流程
                        </h2>
                        <div className="mt-4 space-y-3 text-sm leading-7 text-indigo-50">
                            <div>1. 启动本地服务，例如 `127.0.0.1:3000`。</div>
                            <div>2. 第一次调 `POST /api/sessions/register` 申请 tunnel 和公网域名。没传 `subdomain` 时，默认直接用 `project` 作为固定二级域名。</div>
                            <div>3. 从响应里拿到 `public_url`、`tunnel.id`、`tunnel.token`、`agent_command`。</div>
                            <div>4. 把 `tunnel.id + tunnel.token` 保存到 `~/.tunneling/machine_state.json`，并启动这 1 个本地 agent。</div>
                            <div>5. 后续新增本地服务时，继续调 `POST /api/sessions/register`，但把 `tunnel_id + tunnel_token` 一起传上来，这样只会新增 route，不会再创建新 agent。</div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                        <h2 className="flex items-center text-xl font-bold text-white">
                            <PlugZap className="mr-2 h-5 w-5 text-emerald-300" />
                            关键返回值
                        </h2>
                        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-200">
                            <div><span className="font-semibold text-white">`public_url`</span>：公网访问地址。</div>
                            <div><span className="font-semibold text-white">`tunnel.id`</span>：平台内唯一 tunnel 标识。</div>
                            <div><span className="font-semibold text-white">`tunnel.token`</span>：agent 建连凭证。</div>
                            <div><span className="font-semibold text-white">`agent_command`</span>：直接可执行的 agent 启动命令。</div>
                            <div><span className="font-semibold text-white">`tunnel_id + tunnel_token`</span>：后续复用同一个 agent 时要传回来的凭证。</div>
                        </div>
                    </div>
                </section>

                <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
                    <h2 className="text-xl font-bold text-white">3 个核心接口</h2>
                    <div className="mt-5 space-y-4">
                        {coreApis.map((api) => (
                            <div key={api.path} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-center gap-3">
                                    <MethodBadge method={api.method} />
                                    <code className="rounded-xl bg-black/30 px-3 py-1.5 text-sm text-slate-100">{api.path}</code>
                                </div>
                                <div className="text-sm text-slate-300">{api.desc}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
                    <h2 className="text-xl font-bold text-white">普通注册示例</h2>
                    <p className="mt-3 text-sm leading-7 text-emerald-100">
                        现在注册接口会先尝试固定二级域名语义。传了 `subdomain` 就先尝试 `subdomain.base_domain`，没传就先尝试 `project.base_domain`。如果该二级域名已经存在，普通用户会自动回退成带随机后缀的新域名；管理员则可以覆盖旧绑定。
                    </p>
                    <div className="mt-4 grid gap-6 lg:grid-cols-2">
                        <div>
                            <div className="mb-2 flex items-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                                <TerminalSquare className="mr-2 h-4 w-4" />
                                Request
                            </div>
                            <CodeBlock code={normalRegister} tone="emerald" />
                        </div>
                        <div>
                            <div className="mb-2 flex items-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                                <TerminalSquare className="mr-2 h-4 w-4" />
                                Response
                            </div>
                            <CodeBlock code={registerResponse} tone="sky" />
                        </div>
                    </div>
                </section>

                <section className="mt-8 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6">
                    <h2 className="flex items-center text-xl font-bold text-white">
                        <KeyRound className="mr-2 h-5 w-5 text-amber-300" />
                        管理员覆盖注册示例
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-amber-100">
                        同一个 `user_id + project` 再次注册时，默认会返回冲突错误。要覆盖旧 tunnel 或覆盖一个已经存在的固定二级域名，必须提供管理员密钥。管理员携带 `admin_key` 时，如果域名已存在，会直接覆盖旧绑定；普通用户则只会自动退回到随机后缀域名，不会覆盖别人。
                    </p>
                    <div className="mt-4">
                        <CodeBlock code={overrideRegister} tone="amber" />
                    </div>
                </section>

                <section className="mt-8 rounded-3xl border border-sky-400/20 bg-sky-400/10 p-6">
                    <h2 className="text-xl font-bold text-white">单 Agent 多服务示例</h2>
                    <p className="mt-3 text-sm leading-7 text-sky-100">
                        如果同一台机器上有多个本地服务，推荐只注册第一个服务时创建 tunnel。后面的服务把第一次返回的 `tunnel_id` 和 `tunnel_token` 带上，或者统一从 `~/.tunneling/machine_state.json` 读取，这样 `register` 只会新增 route，仍然复用同一个 agent。
                    </p>
                    <div className="mt-4">
                        <CodeBlock code={reuseTunnelRegister} tone="sky" />
                    </div>
                </section>

                <section className="mt-8 rounded-3xl border border-fuchsia-400/20 bg-fuchsia-400/10 p-6">
                    <h2 className="flex items-center text-xl font-bold text-white">
                        <WandSparkles className="mr-2 h-5 w-5 text-fuchsia-300" />
                        Skill 接入示例
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-fuchsia-100">
                        如果用户不想自己调 HTTP 接口，我们提供了 Skill。一键安装后，用户可以直接对 AI 说自然语言，由 Skill 自动完成注册。
                    </p>
                    <div className="mt-4 grid gap-6 lg:grid-cols-2">
                        <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">安装脚本</div>
                            <CodeBlock code={skillInstall} tone="fuchsia" />
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">对 AI 说</div>
                            <CodeBlock code={skillPrompt} tone="fuchsia" />
                        </div>
                    </div>
                </section>
            </div>
        </main>
    )
}
