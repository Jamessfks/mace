import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://zebsgnnoqetvjzppbprw.supabase.co",
  "sb_publishable_KhKUeFSaSkNSajn7GL105A_jlvNijiJ"
);

async function main() {
  const { data, error } = await supabase
    .from("shared_results")
    .select("id")
    .limit(1);

  if (error) {
    console.error("✗ Table check failed:", error.message);
    console.log("\nYou need to run this SQL in the Supabase dashboard:\n");
    console.log(`  create table shared_results (
    id text primary key,
    result jsonb not null,
    params jsonb not null default '{}',
    filename text,
    created_at timestamptz not null default now()
  );
  alter table shared_results enable row level security;
  create policy "Anyone can read shared results"
    on shared_results for select using (true);
  create policy "Anyone can insert shared results"
    on shared_results for insert with check (true);`);
    process.exit(1);
  }

  console.log("✓ Table exists and is accessible. Rows found:", data?.length ?? 0);
}

main();
