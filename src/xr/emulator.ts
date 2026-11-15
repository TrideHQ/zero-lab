// Development only: installs the IWER WebXR emulator so headset and phone-AR
// modes can be tested on a laptop.  ?iwer=quest3 | glasses | phone
import { XRDevice, metaQuest3, metaVRGlasses } from 'iwer';

export function installEmulator(kind: string) {
  // 'glasses' is IWER's Meta VR Glasses profile (about 70° x 66°); 'quest3' and 'phone' use the Quest 3 profile.
  const device = new XRDevice(kind === 'glasses' ? metaVRGlasses : metaQuest3, { stereoEnabled: false });
  device.installRuntime();
  device.primaryInputMode = 'hand';
  device.position.set(0, 1.2, 0);
  (window as unknown as { __xr: unknown }).__xr = device;
  document.documentElement.dataset.iwer = kind;
}
