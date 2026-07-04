# Moshikizu セルフビルド・インストーラー（Windows / PowerShell）
#   irm https://raw.githubusercontent.com/yupyom/moshikizu/main/install.ps1 | iex
# 再実行で更新（git pull → 再ビルド）
$ErrorActionPreference = "Stop"

$Dir = if ($env:MOSHIKIZU_HOME) { $env:MOSHIKIZU_HOME } else { "$HOME\.moshikizu" }
$Repo = "https://github.com/yupyom/moshikizu.git"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git が必要です" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20+ が必要です（https://nodejs.org/）" }
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 20) { throw "Node.js 20 以上が必要です（現在: $(node -v)）" }

if (Test-Path "$Dir\.git") {
  Write-Host "=== 更新: $Dir ==="
  git -C $Dir pull --ff-only
} else {
  Write-Host "=== 取得: $Dir ==="
  git clone --depth 1 $Repo $Dir
}

Set-Location $Dir
Write-Host "=== 依存関係のインストール ==="
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install が失敗しました" }
Write-Host "=== ビルド ==="
npm run build
if ($LASTEXITCODE -ne 0) { throw "ビルドが失敗しました" }
Write-Host "=== Windows アプリの作成 ==="
# 過去バージョンの zip を誤って拾わないよう、release を空にしてからビルドする
if (Test-Path "apps\desktop\release") { Remove-Item -Recurse -Force "apps\desktop\release" }
npm run --workspace apps/desktop package:win
if ($LASTEXITCODE -ne 0) { throw "アプリの作成が失敗しました" }

$zip = Get-ChildItem "apps\desktop\release\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zip) { throw "ビルド成果物（apps\desktop\release\*.zip）が見つかりません" }

# ユーザー単位インストールの慣例に従い %LOCALAPPDATA%\Programs へ配置
$dest = "$env:LOCALAPPDATA\Programs\Moshikizu"
if (Test-Path "$dest\Moshikizu.exe") {
  try { Remove-Item -Recurse -Force $dest }
  catch { throw "既存の Moshikizu を削除できません。アプリを終了してから再実行してください（$dest）" }
}
Expand-Archive -Path $zip.FullName -DestinationPath $dest -Force

# スタートメニューにショートカットを作成
$lnkPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Moshikizu.lnk"
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = "$dest\Moshikizu.exe"
$lnk.WorkingDirectory = $dest
$lnk.Save()

# 旧配置（ホーム直下）からの移行。アプリ本体しか入っていないため削除してよい
$old = "$HOME\Moshikizu"
if (Test-Path "$old\Moshikizu.exe") {
  try {
    Remove-Item -Recurse -Force $old
    Write-Host "旧バージョン（$old）を削除しました。"
  } catch {
    Write-Host "注意: 旧バージョン（$old）を削除できませんでした。手動で削除してください。"
  }
}

Write-Host ""
Write-Host "完了: スタートメニューの「Moshikizu」から起動できます。"
Write-Host "（本体の場所: $dest）"
Write-Host "（コード署名なしのため SmartScreen 警告が出たら「詳細情報 > 実行」）"
