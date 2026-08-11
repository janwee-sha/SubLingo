import Foundation

func runServerTests() async throws {
    try check(TransportServer.boundHost == "127.0.0.1", "server must bind IPv4 loopback only")

    let credentialDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent("sublingo-credential-contract-\(UUID().uuidString)", isDirectory: true)
    let credentialStore = try SecureCredentialStore(directory: credentialDirectory)
    defer { try? FileManager.default.removeItem(at: credentialDirectory) }
    let handler = ProtocolHandler(token: "correct-token", credentialStore: credentialStore)
    let unauthorized = await handler.handle(path: "/v1/health", authorization: "Bearer wrong", body: Data("{}".utf8))
    try check(unauthorized.statusCode == 401, "wrong bearer token must be rejected")
    let bodylessHealth = await handler.handle(
        path: "/v1/health",
        authorization: "Bearer correct-token",
        body: Data()
    )
    try check(bodylessHealth.statusCode == 200, "IINA may omit the empty health JSON body")
    let invalidHealth = await handler.handle(
        path: "/v1/health",
        authorization: "Bearer correct-token",
        body: Data("{\"unexpected\":true}".utf8)
    )
    try check(invalidHealth.statusCode == 400, "health must reject caller-controlled fields")
    let oversized = await handler.handle(
        path: "/v1/health",
        authorization: "Bearer correct-token",
        body: Data(repeating: 0, count: ProtocolLimits.maxRequestBytes + 1)
    )
    try check(oversized.statusCode == 413, "oversized RPC body must be rejected")

    let profileID = "7a90a4e6-cc4f-4f59-99b7-8ff522f887ae"
    let readCredentialBody = try JSONSerialization.data(withJSONObject: [
        "action": "read", "profileId": profileID,
    ])
    let missingCredential = await handler.handle(
        path: "/v1/credentials",
        authorization: "Bearer correct-token",
        body: readCredentialBody
    )
    let missingCredentialJSON = try JSONSerialization.jsonObject(with: missingCredential.body) as? [String: Any]
    try check(missingCredential.statusCode == 200, "missing credential read must succeed")
    try check(missingCredentialJSON?["fields"] is NSNull, "missing credential must serialize as JSON null")

    let saveCredentialBody = try JSONSerialization.data(withJSONObject: [
        "action": "write", "profileId": profileID, "fields": ["apiKey": "private-key"],
    ])
    let savedCredential = await handler.handle(
        path: "/v1/credentials",
        authorization: "Bearer correct-token",
        body: saveCredentialBody
    )
    try check(savedCredential.statusCode == 200, "fixed credential file write must succeed")
    let storedCredential = try await credentialStore.read(profileID: profileID)
    try check(storedCredential == ["apiKey": "private-key"], "credential must round-trip")
    let attributes = try FileManager.default.attributesOfItem(
        atPath: credentialDirectory.appendingPathComponent("credentials.json").path
    )
    let permissions = (attributes[.posixPermissions] as? NSNumber)?.intValue
    try check(permissions == 0o600, "credential file must be mode 0600")
    let deleteCredentialBody = try JSONSerialization.data(withJSONObject: [
        "action": "delete", "profileId": profileID,
    ])
    let deletedCredential = await handler.handle(
        path: "/v1/credentials",
        authorization: "Bearer correct-token",
        body: deleteCredentialBody
    )
    try check(deletedCredential.statusCode == 200, "credential delete must succeed")
    let credentialAfterDelete = try await credentialStore.read(profileID: profileID)
    try check(credentialAfterDelete == nil, "deleted credential must be absent")
    let invalidCredential = await handler.handle(
        path: "/v1/credentials",
        authorization: "Bearer correct-token",
        body: Data("{\"action\":\"read\",\"profileId\":\"not-a-uuid\"}".utf8)
    )
    try check(invalidCredential.statusCode == 400, "invalid profile IDs must be rejected")

    let encoded = try ReadyFrame(port: 49152, token: "opaque-token").encodedLine()
    try check(encoded.filter { $0 == "\n" }.count == 1 && encoded.hasSuffix("\n"), "startup frame must be one JSON line")
    try check(!encoded.contains("debug"), "startup frame must not include logs")

    let body = Data("{}".utf8)
    let header = Data((
        "POST /v1/health HTTP/1.1\r\n" +
        "Content-Type: application/json\r\n" +
        "Content-Length: \(body.count)\r\n" +
        "Authorization: Bearer correct-token\r\n\r\n"
    ).utf8)
    guard case .incomplete = TransportServer.parseRequest(header) else {
        throw ContractTestFailure(description: "header-only TCP chunk must remain incomplete")
    }
    var splitFrame = header
    splitFrame.append(body.prefix(1))
    guard case .incomplete = TransportServer.parseRequest(splitFrame) else {
        throw ContractTestFailure(description: "partial JSON TCP chunk must remain incomplete")
    }
    splitFrame.append(body.dropFirst(1))
    guard case .complete(let path, let authorization, let parsedBody) = TransportServer.parseRequest(splitFrame) else {
        throw ContractTestFailure(description: "complete split request must parse")
    }
    try check(path == "/v1/health", "parsed request path must match")
    try check(authorization == "Bearer correct-token", "parsed authorization must match")
    try check(parsedBody == body, "parsed split body must match")

    let liveness = LivenessState(parentPID: 999_999, idleTimeout: 1)
    try check(liveness.shouldExit(parentIsAlive: false), "parent loss must request exit")
    liveness.requestShutdown()
    try check(liveness.shouldExit(parentIsAlive: true), "authenticated shutdown must request exit")
}
