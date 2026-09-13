# Portloom Elevation Helper
param (
    [string]$Action = "hosts",
    [string]$HostsSource = "",
    [int]$HttpPort = 80,
    [int]$HttpsPort = 443
)

$ErrorActionPreference = "Stop"

if ($Action -eq "hosts" -and $HostsSource -ne "") {
    try {
        $hostsTarget = "$env:SystemRoot\System32\drivers\etc\hosts"
        Copy-Item -Path $HostsSource -Destination $hostsTarget -Force
        ipconfig /flushdns | Out-Null
        Write-Output "SUCCESS: Hosts updated and DNS flushed."
        exit 0
    } catch {
        Write-Error "ERROR: Failed to update hosts: $_"
        exit 1
    }
}

if ($Action -eq "trust-cert") {
    try {
        $certPath = "$env:APPDATA\Portloom\certs\portloom-ca.crt"
        if (Test-Path $certPath) {
            certutil -addstore Root $certPath | Out-Null
            Write-Output "SUCCESS: Root CA added to Machine Root Store."
            exit 0
        } else {
            Write-Error "Certificate not found at $certPath"
            exit 1
        }
    } catch {
        Write-Error "ERROR: Failed to add cert: $_"
        exit 1
    }
}
