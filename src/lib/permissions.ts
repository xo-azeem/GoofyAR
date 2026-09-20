import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

function openSettingsAlert(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => Linking.openSettings() },
  ]);
}

/**
 * Camera permission is required before the AR session can start on Android.
 * iOS prompts automatically the first time ARKit starts (usage string comes from app.json).
 */
export async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  if (already) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Camera access',
    message: 'GoofyAR needs the camera to place 3D models in your space.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });
  if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    openSettingsAlert('Camera is off', 'Enable camera access for GoofyAR in Settings to use AR.');
  }
  return false;
}

/**
 * Reading files picked through the system picker doesn't need a runtime
 * permission on Android 13+ or iOS. Android 12 and below still expects
 * READ_EXTERNAL_STORAGE for files outside the app sandbox.
 */
export async function ensureStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version >= 33) return true;
  const perm = PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
  if (await PermissionsAndroid.check(perm)) return true;
  const result = await PermissionsAndroid.request(perm, {
    title: 'Storage access',
    message: 'GoofyAR needs storage access to import .glb models from your device.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });
  if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    openSettingsAlert('Storage is off', 'Enable storage access for GoofyAR in Settings to import models.');
  }
  return false;
}
