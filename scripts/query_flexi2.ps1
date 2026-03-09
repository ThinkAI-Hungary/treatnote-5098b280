$pat = 'sbp_b7269030a0956e2990fe08642b601135839a4492'
$sql = "SELECT id, message, metadata, created_at FROM auth.audit_log_entries WHERE created_at > now() - interval '10 minutes' ORDER BY created_at DESC LIMIT 20"

$body = @{ query = $sql } | ConvertTo-Json
$headers = @{
    'Authorization' = "Bearer $pat"
    'Content-Type'  = 'application/json'
}

try {
    $result = Invoke-RestMethod -Uri 'https://api.supabase.com/v1/projects/bpjzgapmoyhtgryglcke/database/query' -Method POST -Headers $headers -Body $body
    if ($result.Count -eq 0) {
        Write-Host "No recent audit log entries"
    } else {
        $result | ConvertTo-Json -Depth 5
    }
} catch {
    Write-Host "Error: $_"
}
