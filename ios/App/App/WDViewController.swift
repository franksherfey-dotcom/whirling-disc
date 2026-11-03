import UIKit
import Capacitor

// Bridge view controller that registers the local WDTorch plugin.
class WDViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WDTorchPlugin())
    }
}
