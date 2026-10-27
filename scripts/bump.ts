import { join } from "path";

const targetVersion = process.argv[2];
if (!targetVersion) {
  console.error("Error: Please specify a version. Example: bun run bump 0.2.0");
  process.exit(1);
}

const semverRegex = /^\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/;
if (!semverRegex.test(targetVersion)) {
  console.error(`Error: Invalid version format "${targetVersion}". Expected x.y.z or x.y.z-tag.n`);
  process.exit(1);
}

// 1. package.json
try {
  const pkgPath = join(process.cwd(), "package.json");
  const pkgText = await Bun.file(pkgPath).text();
  const pkg = JSON.parse(pkgText);
  const oldVersion = pkg.version;
  pkg.version = targetVersion;
  await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`✓ package.json: ${oldVersion} -> ${targetVersion}`);
} catch (e: any) {
  console.error("Failed to update package.json:", e.message);
  process.exit(1);
}

// 2. src-tauri/tauri.conf.json
try {
  const tauriPath = join(process.cwd(), "src-tauri/tauri.conf.json");
  const tauriText = await Bun.file(tauriPath).text();
  const tauriConfig = JSON.parse(tauriText);
  const oldVersion = tauriConfig.version;
  
  // Update version in tauri.conf.json
  tauriConfig.version = targetVersion;
  
  await Bun.write(tauriPath, JSON.stringify(tauriConfig, null, 2) + "\n");
  console.log(`✓ tauri.conf.json: ${oldVersion} -> ${targetVersion}`);
} catch (e: any) {
  console.error("Failed to update tauri.conf.json:", e.message);
  process.exit(1);
}

// 3. src-tauri/Cargo.toml
try {
  const cargoPath = join(process.cwd(), "src-tauri/Cargo.toml");
  const cargoText = await Bun.file(cargoPath).text();
  
  // Find the current version for logging
  const versionMatch = cargoText.match(/^version\s*=\s*"([^"]+)"/m);
  const oldVersion = versionMatch ? versionMatch[1] : "unknown";
  
  const updatedCargo = cargoText.replace(/^(version\s*=\s*")[^"]*(")/m, `$1${targetVersion}$2`);
  await Bun.write(cargoPath, updatedCargo);
  console.log(`✓ Cargo.toml: ${oldVersion} -> ${targetVersion}`);
} catch (e: any) {
  console.error("Failed to update Cargo.toml:", e.message);
  process.exit(1);
}

console.log(`Successfully bumped version to ${targetVersion}!`);
