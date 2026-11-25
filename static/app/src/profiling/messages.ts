import type { FileProfile } from '../../../../src/domain/profile';
import type { ProfileFileOptions } from './profileFile';

export interface ProfileRequest {
  file: File;
  options: ProfileFileOptions;
}

export type ProfileMessage =
  | { type: 'progress'; rows: number }
  | { type: 'done'; profile: FileProfile }
  | { type: 'error'; message: string };
