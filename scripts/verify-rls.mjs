import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error(
    'Missing Supabase URL / anon key. Set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  )
  process.exit(2)
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const results = []

function record(name, passed, detail) {
  results.push({ name, passed })
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  console.log(`Verifying RLS with the anon key against ${url}\n`)

  // Positive controls: prove the client is connected and RLS permits the reads
  // it is supposed to permit, so a failure below is RLS, not a bad URL/key.
  {
    const { data, error } = await supabase.from('products').select('id').limit(1)
    record(
      'control: anon CAN read products (products_read_all)',
      !error,
      error ? error.message : `allowed, ${data?.length ?? 0} row(s) visible`
    )
  }

  {
    const { data, error } = await supabase
      .from('lookup_config')
      .select('id')
      .eq('is_published', true)
      .limit(1)
    record(
      'control: anon CAN read published lookup_config (config_read_published)',
      !error,
      error ? error.message : `allowed, ${data?.length ?? 0} row(s) visible`
    )
  }

  // SEC-02: anon must NOT read submissions (submissions_read_admin)
  {
    const { data, error } = await supabase.from('submissions').select('id').limit(1)
    const blocked = Boolean(error) || (data?.length ?? 0) === 0
    record(
      'anon CANNOT read submissions',
      blocked,
      error ? `blocked: ${error.message}` : 'blocked: 0 rows returned'
    )
  }

  // SEC-02: anon must NOT write products (products_write_admin)
  {
    const { error } = await supabase.from('products').insert({
      name: 'rls-verification-probe',
      category: 'gmo_food',
      subcategory: 'packaged_food',
      ingredients_text: 'rls verification probe — must never be written',
      result_tier: 'low',
      result_label: 'RLS verification probe',
      confidence_tier: 'low',
      config_version: 'rls-verification',
    })
    record(
      'anon CANNOT insert into products',
      Boolean(error),
      error ? `blocked: ${error.message}` : 'INSERT SUCCEEDED — RLS IS MISCONFIGURED'
    )
  }

  // SEC-02: anon must NOT write lookup_config (config_write_admin)
  {
    const { data, error } = await supabase
      .from('lookup_config')
      .update({ is_published: true })
      .eq('category', 'gmo_food')
      .select('id')
    const blocked = Boolean(error) || (data?.length ?? 0) === 0
    record(
      'anon CANNOT update lookup_config',
      blocked,
      error ? `blocked: ${error.message}` : 'blocked: 0 rows affected'
    )
  }

  // SEC-02/SEC-03: anon must NOT read profiles (profiles_read_own)
  {
    const { data, error } = await supabase.from('profiles').select('id').limit(1)
    const blocked = Boolean(error) || (data?.length ?? 0) === 0
    record(
      'anon CANNOT read profiles',
      blocked,
      error ? `blocked: ${error.message}` : 'blocked: 0 rows returned'
    )
  }

  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) {
    console.error(`\nRLS verification FAILED (${failed.length} check(s))`)
    process.exit(1)
  }
  console.log('\nRLS verification PASSED')
}

main().catch((err) => {
  console.error('Unexpected error during RLS verification:', err)
  process.exit(1)
})
