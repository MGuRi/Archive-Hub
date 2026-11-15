param(
  [string]$Action = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$procs = Get-Process Spotify -ErrorAction SilentlyContinue
if (-not $procs) {
  Write-Output "NONE"
  exit 0
}

$winTitle = ($procs | Where-Object { $_.MainWindowTitle } | Select-Object -First 1 -ExpandProperty MainWindowTitle)
$track = ""
$playing = $false

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
  }
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $sessions = $mgr.GetSessions()
  foreach ($s in $sessions) {
    if ($s.SourceAppUserModelId -match 'Spotify') {
      if ($Action -eq 'playpause') {
        Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null
        Start-Sleep -Milliseconds 180
      } elseif ($Action -eq 'next') {
        Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null
        Start-Sleep -Milliseconds 180
      } elseif ($Action -eq 'prev') {
        Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null
        Start-Sleep -Milliseconds 180
      }
      $pb = [string]$s.GetPlaybackInfo().PlaybackStatus
      $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $artist = [string]$props.Artist
      $title = [string]$props.Title
      if ($title) {
        $track = if ($artist) { "$artist - $title" } else { $title }
      }
      $playing = ($pb -eq 'Playing')
      break
    }
  }
} catch {}

if (-not $track -and $winTitle -and $winTitle -notmatch '^Spotify(\s+(Free|Premium))?$') {
  $track = $winTitle
  $playing = $true
}

$state = if ($playing) { 'PLAYING' } else { 'PAUSED' }
Write-Output "RUNNING|$state|$track"
