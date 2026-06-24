import * as Application from 'expo-application';
import { Linking, Platform } from 'react-native';

export interface MobileReleaseManifest {
  version: string;
  build: number;
  apkUrl: string;
  publishedAt: string;
  notes: string[];
}

export interface MobileUpdateCheck {
  currentVersion: string;
  currentBuild: number;
  release: MobileReleaseManifest | null;
  updateAvailable: boolean;
}

const RELEASE_MANIFEST_URL =
  'https://github.com/YzDemnz/judicial-managment-mobile/releases/latest/download/mobile-release.json';

export const currentMobileVersion = Application.nativeApplicationVersion ?? '3.2.1';
export const currentMobileBuild = Number.parseInt(Application.nativeBuildVersion ?? '5', 10) || 0;

const parseVersion = (version: string) =>
  version
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);

export const isNewerVersion = (candidate: string, current: string) => {
  const candidateParts = parseVersion(candidate);
  const currentParts = parseVersion(current);
  const maxLength = Math.max(candidateParts.length, currentParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const candidatePart = candidateParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (candidatePart > currentPart) return true;
    if (candidatePart < currentPart) return false;
  }

  return false;
};

export const checkForMobileUpdate = async (): Promise<MobileUpdateCheck> => {
  if (Platform.OS !== 'android') {
    return {
      currentVersion: currentMobileVersion,
      currentBuild: currentMobileBuild,
      release: null,
      updateAvailable: false,
    };
  }

  const response = await fetch(`${RELEASE_MANIFEST_URL}?t=${Date.now()}`, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar la version publicada (${response.status}).`);
  }

  const release = (await response.json()) as MobileReleaseManifest;
  if (!release.version || !release.apkUrl) {
    throw new Error('La informacion de la actualizacion esta incompleta.');
  }

  const normalizedRelease: MobileReleaseManifest = {
    ...release,
    build: Number(release.build) || 0,
    publishedAt: release.publishedAt || '',
    notes:
      Array.isArray(release.notes) && release.notes.length > 0
        ? release.notes
        : ['Mejoras generales y correcciones de estabilidad.'],
  };

  return {
    currentVersion: currentMobileVersion,
    currentBuild: currentMobileBuild,
    release: normalizedRelease,
    updateAvailable:
      isNewerVersion(normalizedRelease.version, currentMobileVersion) ||
      (normalizedRelease.version === currentMobileVersion && normalizedRelease.build > currentMobileBuild),
  };
};

export const openMobileUpdate = async (release: MobileReleaseManifest) => {
  const supported = await Linking.canOpenURL(release.apkUrl);
  if (!supported) {
    throw new Error('El dispositivo no puede abrir la descarga de la actualizacion.');
  }

  await Linking.openURL(release.apkUrl);
};
