$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
Set-Clipboard -Value $secret
Write-Host "Secret copied to clipboard (length $($secret.Length)). Paste it into Vercel and Cloudflare."
