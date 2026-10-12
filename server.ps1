$port = 5500
$url = "http://localhost:$port/"
$dir = $PSScriptRoot
if (-not $dir) { $dir = (Get-Location).Path }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
    $listener.Start()
} catch {
    Write-Host "El puerto $port ya est en uso o no se pudo iniciar: $($_.Exception.Message)"
    Start-Process $url
    exit
}

Write-Host "========================================================" -ForegroundColor Yellow
Write-Host "   SISTEMA DE INVENTARIO Y FACTURACIN LA COMADREJAJA" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Yellow
Write-Host "Servidor activo en: $url" -ForegroundColor Green
Write-Host "La cmara web y escner funcionarn al 100% en esta direccin."
Write-Host "Para detener el servidor, simplemente cierra esta ventana." -ForegroundColor Cyan
Write-Host "========================================================"

# Abrir el navegador automticamente
Start-Process $url

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath.TrimStart('/'))
        if ([string]::IsNullOrEmpty($rawPath)) { $rawPath = "index.html" }
        $filePath = Join-Path $dir $rawPath

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".jpeg" { "image/jpeg" }
                ".jpg"  { "image/jpeg" }
                ".png"  { "image/png" }
                ".ico"  { "image/x-icon" }
                default { "application/octet-stream" }
            }
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.OutputStream.Close()
    } catch {
        # Ignorar desconexiones rpidas del navegador
    }
}
