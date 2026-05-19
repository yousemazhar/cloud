# Builds and packages the server bundle, then uploads it to the artifacts S3 bucket.
# EC2 user-data downloads s3://<artifacts-bucket>/server-bundle.tgz on first boot.
#
# Usage: .\scripts\package-server.ps1 -ArtifactsBucket mini-jira-artifacts-839629614250 -Profile mini-jira

param(
  [Parameter(Mandatory=$true)][string]$ArtifactsBucket,
  [string]$Profile = "mini-jira",
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

Write-Host "Building shared + server..."
npm run build -w shared
npm run build -w server

$BundleRoot = "build-bundle"
if (Test-Path $BundleRoot) { Remove-Item -Recurse -Force $BundleRoot }
New-Item -ItemType Directory -Path $BundleRoot | Out-Null
New-Item -ItemType Directory -Path "$BundleRoot/server/dist" | Out-Null
New-Item -ItemType Directory -Path "$BundleRoot/shared/dist" | Out-Null
New-Item -ItemType Directory -Path "$BundleRoot/client/dist" | Out-Null

Write-Host "Copying server dist + package.json..."
Copy-Item -Recurse "server/dist/*" "$BundleRoot/server/dist/"
Copy-Item "server/package.json" "$BundleRoot/server/"
Copy-Item -Recurse "shared/dist/*" "$BundleRoot/shared/dist/"
Copy-Item "shared/package.json" "$BundleRoot/shared/"

Write-Host "Building client (production)..."
npm run build -w client
Copy-Item -Recurse "client/dist/*" "$BundleRoot/client/dist/"

# Top-level package.json so `npm ci --omit=dev` resolves shared/ as a workspace
Copy-Item "package.json" "$BundleRoot/package.json"
Copy-Item "package-lock.json" "$BundleRoot/package-lock.json" -ErrorAction SilentlyContinue

Write-Host "Creating tarball..."
$TarPath = "server-bundle.tgz"
if (Test-Path $TarPath) { Remove-Item -Force $TarPath }
tar -czf $TarPath -C $BundleRoot .

Write-Host "Uploading to s3://$ArtifactsBucket/server-bundle.tgz..."
aws s3 cp $TarPath "s3://$ArtifactsBucket/server-bundle.tgz" --profile $Profile --region $Region

Write-Host "`nDone. Now run an ASG instance refresh to redeploy:"
Write-Host "  aws autoscaling start-instance-refresh --auto-scaling-group-name <name> --profile $Profile --region $Region"
