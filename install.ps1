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
npm run --workspace apps/desktop package:win
if ($LASTEXITCODE -ne 0) { throw "アプリの作成が失敗しました" }

$zip = Get-ChildItem "apps\desktop\release\*.zip" | Select-Object -First 1
if (-not $zip) { throw "ビルド成果物（apps\desktop\release\*.zip）が見つかりません" }
$dest = "$HOME\Moshikizu"
Expand-Archive -Path $zip.FullName -DestinationPath $dest -Force
Write-Host ""
Write-Host "完了: $dest に展開しました。Moshikizu.exe を起動してください。"
Write-Host "（コード署名なしのため SmartScreen 警告が出たら「詳細情報 > 実行」）"
