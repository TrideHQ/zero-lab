// Development only: installs the IWER WebXR emulator so headset and phone-AR
// modes can be tested on a laptop.  ?iwer=quest3 | glasses | phone
import { XRDevice, metaQuest3 } from 'iwer';

export function installEmulator(kind: string) {
  const glasses = kind === 'glasses';
  // The VR Glasses profile: a Quest-class device limited to a 70° x 66° field of view.
  const device = new XRDevice(metaQuest3, { stereoEnabled: false, fovy: ((glasses ? 66 : 96) * Math.PI) / 180 });
  device.installRuntime();
  device.primaryInputMode = 'hand';
  device.position.set(0, 1.2, 0);
  (window as unknown as { __xr: unknown }).__xr = device;
  document.documentElement.dataset.iwer = kind;
}
