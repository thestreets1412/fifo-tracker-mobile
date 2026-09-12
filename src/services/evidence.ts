import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { generateEvidenceFilename } from '../ui/evidenceName';

export function evidenceDir(): string {
  return `${FileSystem.documentDirectory}evidence/`;
}

export function resolveEvidenceUri(filename: string): string {
  return `${evidenceDir()}${filename}`;
}

/** Opens the gallery (images only) and returns the picked URI, or null if cancelled. */
export async function pickImageFromGallery(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0]!.uri;
}

/** Copies a picked image into the app's evidence folder and returns its bare filename. */
export async function storeEvidence(sourceUri: string): Promise<string> {
  const dir = evidenceDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const filename = generateEvidenceFilename(sourceUri);
  await FileSystem.copyAsync({ from: sourceUri, to: `${dir}${filename}` });
  return filename;
}

export async function deleteEvidence(filename: string): Promise<void> {
  await FileSystem.deleteAsync(resolveEvidenceUri(filename), { idempotent: true });
}
