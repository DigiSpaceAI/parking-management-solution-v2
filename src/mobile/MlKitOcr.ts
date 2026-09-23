import { registerPlugin } from '@capacitor/core';

export interface MlKitOcrResult {
  /** Full recognized text, as ML Kit sees it (may include line breaks). */
  text: string;
  /** Same text broken into individual recognized lines. */
  lines: string[];
}

export interface MlKitOcrPlugin {
  /**
   * Runs Android's on-device ML Kit Text Recognition against a single
   * base64-encoded image (accepts either a bare base64 string or a full
   * data URL). Hardware-accelerated and fully offline — no network call,
   * no server round-trip. Android-only: this plugin has no iOS
   * implementation, so calling it on any other platform will reject.
   */
  recognizeText(options: { imageBase64: string }): Promise<MlKitOcrResult>;
}

export const MlKitOcr = registerPlugin<MlKitOcrPlugin>('MlKitOcr');
