$ErrorActionPreference = 'Stop'
$StartScript = Join-Path $PSScriptRoot 'start-agent.ps1'
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName 'Newsroom Publisher' -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description 'Native visible Chrome publisher for the local newsroom'
Write-Host 'Installed Newsroom Publisher at interactive login. Run start-agent.ps1 to test it now.'
