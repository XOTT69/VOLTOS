import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
export const native = Capacitor.isNativePlatform();
interface SecureSessions {
  setAppearance(options: { dark: boolean }): Promise<void>;
  getSession(options: { key: string }): Promise<{ value?: string }>;
  setSession(options: { key: string; value: string }): Promise<void>;
  removeSession(options: { key: string }): Promise<void>;
}
export const SecureSession = registerPlugin<SecureSessions>('VoltosNative');
export function tap() { if (native) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); }
export async function shareCsv(content: string, filename: string) {
  if (native) {
    const file = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'VOLTOS · Історія', files: [file.uri], dialogTitle: 'Зберегти історію' });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
