import { getVersion } from '@tauri-apps/api/app';

export async function getAppVersion() {
    const appVersion = await getVersion();
    return appVersion;
}