# PowerShell script to create .env without trailing newlines
$envContent = @"
SUPABASE_URL=https://cwsdvgkjptuvbdtxcejt.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3c2R2Z2tqcHR1dmJkdHhjZWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzOTQ0MzksImV4cCI6MjA3MTk3MDQzOX0.kSKAYjtFWoxHn0PNq6mAZ2OEngeGR7i_FW3V75Hrby8
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3c2R2Z2tqcHR1dmJkdHhjZWp0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjM5NDQzOSwiZXhwIjoyMDcxOTcwNDM5fQ.KOOooT-vz-JW2rcdwJdQdirePPIERmYWR4Vqy2v_2NY
DATABASE_URL=postgresql://postgres.cwsdvgkjptuvbdtxcejt:EGxhoDsQvygcwY5c@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres:EGxhoDsQvygcwY5c@db.cwsdvgkjptuvbdtxcejt.supabase.co:5432/postgres
DATABASE_PASSWORD=EGxhoDsQvygcwY5c
NODE_ENV=production
"@

# Write with UTF8 encoding, no BOM
[System.IO.File]::WriteAllLines(".env", $envContent.Split("`n"), [System.Text.UTF8Encoding]::new($false))
Write-Host "✅ .env created successfully (no trailing newlines)"
