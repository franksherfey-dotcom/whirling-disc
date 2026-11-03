import Foundation
import Capacitor
import AVFoundation

// Drives the back camera's torch while the in-app capture screens are open.
// JS: setTorch({ on: true, level: 0.6 }) → { supported: true }
@objc(WDTorchPlugin)
public class WDTorchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WDTorchPlugin"
    public let jsName = "WDTorch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTorch", returnType: CAPPluginReturnPromise)
    ]

    @objc func setTorch(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        let requested = call.getFloat("level") ?? 1.0

        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else {
            call.resolve(["supported": false])
            return
        }

        do {
            try device.lockForConfiguration()
        } catch {
            call.reject("Couldn't control the camera light", nil, error)
            return
        }
        defer { device.unlockForConfiguration() }

        do {
            if on {
                let level = min(max(requested, 0.05), AVCaptureDevice.maxAvailableTorchLevel)
                try device.setTorchModeOn(level: level)
            } else {
                device.torchMode = .off
            }
            call.resolve(["supported": true])
        } catch {
            call.reject("Couldn't set the camera light", nil, error)
        }
    }
}
