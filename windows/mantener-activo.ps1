# Mantiene Ubuntu (WSL) encendido para que el bot responda siempre que el PC esté prendido.
# Uso (PowerShell normal, no hace falta administrador):
#   powershell -ExecutionPolicy Bypass -File .\mantener-activo.ps1
#   powershell -ExecutionPolicy Bypass -File .\mantener-activo.ps1 -Distro Ubuntu-24.04
#   powershell -ExecutionPolicy Bypass -File .\mantener-activo.ps1 -Quitar
param(
    [string]$Distro = "Ubuntu",
    [switch]$Quitar
)
$ErrorActionPreference = "Stop"
$NombreTarea = "Agente de citas - mantener WSL"

if ($Quitar) {
    Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tarea eliminada. WSL volverá a apagarse cuando no lo uses."
    exit 0
}

$distros = (wsl.exe --list --quiet) -replace "`0", "" | Where-Object { $_.Trim() -ne "" } | ForEach-Object { $_.Trim() }
if ($distros -notcontains $Distro) {
    Write-Host "No encontré la distribución '$Distro'. Las instaladas son: $($distros -join ', ')"
    Write-Host "Vuelve a ejecutar con -Distro <nombre>."
    exit 1
}

# 1. Que WSL no apague la máquina virtual por inactividad.
$wslconfig = Join-Path $env:USERPROFILE ".wslconfig"
$lineas = @()
if (Test-Path $wslconfig) { $lineas = @(Get-Content $wslconfig) }
$lineas = @($lineas | Where-Object { $_ -notmatch '^\s*vmIdleTimeout\s*=' })
if (-not ($lineas -match '^\s*\[wsl2\]\s*$')) { $lineas += "[wsl2]" }
$nuevas = @()
foreach ($l in $lineas) {
    $nuevas += $l
    if ($l -match '^\s*\[wsl2\]\s*$') { $nuevas += "vmIdleTimeout=2147483647" }
}
Set-Content -Path $wslconfig -Value $nuevas -Encoding ASCII
Write-Host "1/3 .wslconfig: vmIdleTimeout al máximo ($wslconfig)."

# 2. Tarea que abre Ubuntu en segundo plano al iniciar sesión en Windows.
$accion = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -NoProfile -Command wsl.exe -d $Distro -u root --exec sleep infinity"
$disparador = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -Hidden
Register-ScheduledTask -TaskName $NombreTarea -Action $accion -Trigger $disparador -Settings $ajustes `
    -Description "Mantiene WSL encendido para el agente de citas (n8n en Docker)." -Force | Out-Null
Start-ScheduledTask -TaskName $NombreTarea
Write-Host "2/3 Tarea '$NombreTarea' creada e iniciada."

# 3. Que el PC no se suspenda mientras esté conectado a la corriente.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
Write-Host "3/3 Suspensión desactivada con el cargador conectado."
Write-Host ""
Write-Host "Listo. Para que el cambio de .wslconfig aplique, ejecuta una vez: wsl --shutdown"
Write-Host "y luego cierra sesión en Windows y vuelve a entrar (o reinicia)."
