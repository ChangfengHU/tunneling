import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envRaw = fs.readFileSync('console/.env.local', 'utf-8')
const env = Object.fromEntries(envRaw.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=')))
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function test() {
    console.log("Fetching tunnels anonymously...")
    const { data: d1, error: e1 } = await supabase.from('tunnel_instances').select('*')
    console.log(d1, e1)
}
test()
