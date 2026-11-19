$secureApiKey = Read-Host "AQ.Ab8RN6LqnV6t8nH4OGrU80FjCo5-0Wx9uKkfaxX-ypwVPkhNQA" -AsSecureString

if ($secureApiKey.Length -eq 0) {
    Write-Error "No API key was entered."
    exit 1
}

$pointer = [IntPtr]::Zero
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

    [Environment]::SetEnvironmentVariable("GEMINI_API_KEY", $apiKey, "User")
    $env:GEMINI_API_KEY = $apiKey
}
finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

Write-Host "GEMINI_API_KEY is set for your Windows user. Open a new terminal for other programs to see it."
