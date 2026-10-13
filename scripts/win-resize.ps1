Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W3 {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int W, int H, bool repaint);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$p = Get-Process creative-studio-desktop
$h = $p.MainWindowHandle
if ([W3]::IsIconic($h)) { [W3]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 400 }  # SW_RESTORE=9
[W3]::MoveWindow($h, 200, 150, 1150, 800, $true) | Out-Null
Start-Sleep -Milliseconds 600
$r = New-Object W3+RECT
[W3]::GetWindowRect($h, [ref]$r) | Out-Null
Write-Output ('final: ' + ($r.Right - $r.Left) + 'x' + ($r.Bottom - $r.Top) + ' minimized=' + [W3]::IsIconic($h))
