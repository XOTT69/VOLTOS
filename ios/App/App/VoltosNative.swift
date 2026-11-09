import Capacitor
import Security
import UIKit

@objc(VoltosNativePlugin)
public class VoltosNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoltosNativePlugin"
    public let jsName = "VoltosNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise)
    ]
    private let service = "app.voltos.energy.sessions.v1"

    private func query(_ call: CAPPluginCall) -> [String: Any]? {
        guard let key = call.getString("key"), ["atlantic", "oukitel"].contains(key) else {
            call.reject("Невідомий тип сесії")
            return nil
        }
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: key,
                kSecAttrSynchronizable as String: false]
    }

    @objc func getSession(_ call: CAPPluginCall) {
        guard var request = query(call) else { return }
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(); return }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Не вдалося прочитати захищену сесію. Розблокуй iPhone та повтори.")
            return
        }
        call.resolve(["value": value])
    }

    @objc func setSession(_ call: CAPPluginCall) {
        guard let request = query(call) else { return }
        guard let value = call.getString("value"), !value.isEmpty, value.utf8.count <= 8192,
              let data = value.data(using: .utf8) else { call.reject("Некоректна сесія"); return }
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(request as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = request
            for (key, value) in attributes { item[key] = value }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { call.reject("Не вдалося зберегти сесію в Keychain"); return }
        call.resolve()
    }

    @objc func removeSession(_ call: CAPPluginCall) {
        guard let request = query(call) else { return }
        let status = SecItemDelete(request as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Не вдалося видалити захищену сесію")
            return
        }
        call.resolve()
    }

    @objc func setAppearance(_ call: CAPPluginCall) {
        let dark = call.getBool("dark") ?? false
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController as? VoltosViewController else {
                call.reject("Не знайдено екран застосунку"); return
            }
            controller.overrideUserInterfaceStyle = dark ? .dark : .light
            controller.darkAppearance = dark
            let color = dark ? UIColor(red: 16/255, green: 23/255, blue: 19/255, alpha: 1) : UIColor(red: 243/255, green: 245/255, blue: 240/255, alpha: 1)
            controller.view.backgroundColor = color
            self.bridge?.webView?.backgroundColor = color
            controller.setNeedsStatusBarAppearanceUpdate()
            call.resolve()
        }
    }
}

class VoltosViewController: CAPBridgeViewController {
    var darkAppearance = false
    override var preferredStatusBarStyle: UIStatusBarStyle { darkAppearance ? .lightContent : .darkContent }
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VoltosNativePlugin())
        webView?.scrollView.bounces = false
        webView?.isOpaque = false
    }
}
