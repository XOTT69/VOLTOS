import Capacitor
import Network

/// Restricted transport: one explicitly selected private IPv4 peer, TCP 6607 only.
@objc(OukitelLanPlugin)
public class OukitelLanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OukitelLanPlugin"
    public let jsName = "OukitelLan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "app.voltos.oukitel.lan")
    private var connection: NWConnection?
    private var sessionID = ""
    private var pendingConnect: CAPPluginCall?
    private var ready = false

    private func privateAddress(_ host: String) -> Bool {
        let fields = host.split(separator: ".", omittingEmptySubsequences: false)
        guard fields.count == 4 else { return false }
        var bytes: [Int] = []
        for field in fields {
            guard let number = Int(field), number >= 0, number <= 255, String(number) == String(field) else { return false }
            bytes.append(number)
        }
        guard bytes[3] > 0, bytes[3] < 255 else { return false }
        return bytes[0] == 10 || (bytes[0] == 172 && (16...31).contains(bytes[1])) || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254 && bytes[2] != 0)
    }
    private func emit(_ name: String, _ data: [String: Any]) {
        DispatchQueue.main.async { self.notifyListeners(name, data: data) }
    }
    private func finish(_ error: String? = nil) {
        let id = sessionID
        let pending = pendingConnect
        pendingConnect = nil
        ready = false
        connection?.stateUpdateHandler = nil
        connection?.cancel()
        connection = nil
        sessionID = ""
        pending?.reject(error ?? "Локальне підключення скасовано")
        if !id.isEmpty { emit("lanState", ["sessionId": id, "connected": false, "error": error ?? ""]) }
    }
    @objc func connect(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), privateAddress(host),
              let id = call.getString("sessionId"), id.count <= 64,
              id.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil else {
            call.reject("Вкажи локальну IPv4-адресу станції"); return
        }
        queue.async {
            self.finish()
            self.sessionID = id
            self.pendingConnect = call
            let peer = NWConnection(host: NWEndpoint.Host(host), port: 6607, using: .tcp)
            self.connection = peer
            peer.stateUpdateHandler = { [weak owner = self, weak peer] state in
                guard let self = owner, let peer = peer, self.connection === peer, self.sessionID == id else { return }
                switch state {
                case .ready:
                    self.ready = true
                    self.pendingConnect?.resolve()
                    self.pendingConnect = nil
                    self.receive(peer, id)
                case .failed:
                    self.finish("Станція недоступна в локальній мережі. Перевір Wi-Fi, IP та дозвіл Local Network.")
                case .cancelled:
                    self.finish()
                default: break
                }
            }
            peer.start(queue: self.queue)
            self.queue.asyncAfter(deadline: .now() + 12) { [weak owner = self, weak peer] in
                guard let self = owner, let peer = peer, self.connection === peer, !self.ready else { return }
                self.finish("Немає відповіді TCP 6607. Перевір одну Wi-Fi мережу та дозвіл Local Network.")
            }
        }
    }
    private func receive(_ peer: NWConnection, _ id: String) {
        peer.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self, weak peer] data, _, complete, error in
            guard let self = self, let peer = peer, self.connection === peer, self.sessionID == id else { return }
            if let data = data, !data.isEmpty { self.emit("lanData", ["sessionId": id, "data": data.base64EncodedString()]) }
            if complete || error != nil { self.finish("Локальний зв’язок зі станцією втрачено"); return }
            self.receive(peer, id)
        }
    }
    @objc func write(_ call: CAPPluginCall) {
        guard let id = call.getString("sessionId"), let encoded = call.getString("data"), encoded.count <= 24000,
              let data = Data(base64Encoded: encoded), !data.isEmpty, data.count <= 16384 else { call.reject("Некоректний LAN-пакет"); return }
        queue.async {
            guard self.ready, self.sessionID == id, let peer = self.connection else { call.reject("Локальний канал не підключено"); return }
            peer.send(content: data, completion: .contentProcessed { error in
                if error != nil { call.reject("Помилка надсилання станції") } else { call.resolve() }
            })
        }
    }
    @objc func disconnect(_ call: CAPPluginCall) {
        let id = call.getString("sessionId")
        queue.async {
            if id == self.sessionID { self.finish() }
            call.resolve()
        }
    }
}
