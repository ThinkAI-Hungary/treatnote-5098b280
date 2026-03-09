$secret = '2c162a14-cb50-4692-9811-ff9ab604919a'
$now = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$exp = $now + 3600

$headerJson = '{"alg":"HS256","typ":"JWT"}'
$payloadJson = '{"iss":"supabase","ref":"bpjzgapmoyhtgryglcke","role":"service_role","iat":' + $now + ',"exp":' + $exp + '}'

function B64Url([byte[]]$bytes) {
    [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$h = B64Url([System.Text.Encoding]::UTF8.GetBytes($headerJson))
$p = B64Url([System.Text.Encoding]::UTF8.GetBytes($payloadJson))
$msg = "$h.$p"

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($secret)
$sig = B64Url($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($msg)))
$jwt = "$msg.$sig"

$url = 'https://bpjzgapmoyhtgryglcke.supabase.co/rest/v1/flexi_auth?select=user_id,flexi_username,telephely_id&flexi_username=eq.flexident@flexident.hu'
$headers = @{
    'apikey'        = $jwt
    'Authorization' = "Bearer $jwt"
}

try {
    $result = Invoke-RestMethod -Uri $url -Headers $headers -Method GET
    if ($result.Count -eq 0) {
        Write-Host "No rows found for flexident@flexident.hu"
    } else {
        $result | ForEach-Object {
            Write-Host "user_id:      $($_.user_id)"
            Write-Host "flexi_email:  $($_.flexi_username)"
            Write-Host "telephely_id: $($_.telephely_id)"
            Write-Host "---"
        }
        # Now look up email from profiles
        foreach ($row in $result) {
            $uid = $row.user_id
            $pUrl = "https://bpjzgapmoyhtgryglcke.supabase.co/rest/v1/profiles?select=full_name,email&id=eq.$uid"
            $profile = Invoke-RestMethod -Uri $pUrl -Headers $headers -Method GET
            Write-Host "full_name: $($profile[0].full_name)"
            Write-Host "email:     $($profile[0].email)"
        }
    }
} catch {
    Write-Host "Error: $_"
}
