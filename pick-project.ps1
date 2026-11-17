$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Windows.Forms.Application]::EnableVisualStyles()
$dialog = [Windows.Forms.FolderBrowserDialog]::new()
$owner = [Windows.Forms.Form]::new()
try {
    $dialog.Description = 'Agent Workspace için Git proje klasörünü seç'
    $dialog.ShowNewFolderButton = $false
    $owner.TopMost = $true
    $null = $owner.Handle
    if ($dialog.ShowDialog($owner) -eq [Windows.Forms.DialogResult]::OK) {
        [Console]::Write($dialog.SelectedPath)
    }
}
finally {
    $dialog.Dispose()
    $owner.Dispose()
}
