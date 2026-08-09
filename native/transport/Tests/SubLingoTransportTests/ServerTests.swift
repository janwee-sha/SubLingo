import Foundation

func runServerTests() async throws {
    try check(TransportServer.boundHost == "127.0.0.1", "server must bind IPv4 loopback only")

    let handler = ProtocolHandler(token: "correct-token")
    let unauthorized = await handler.handle(path: "/v1/random", authorization: "Bearer wrong", body: Data("{}".utf8))
    try check(unauthorized.statusCode == 401, "wrong bearer token must be rejected")
    let oversized = await handler.handle(
        path: "/v1/random",
        authorization: "Bearer correct-token",
        body: Data(repeating: 0, count: ProtocolLimits.maxRequestBytes + 1)
    )
    try check(oversized.statusCode == 413, "oversized RPC body must be rejected")

    let first = try SecureRandom.bytes(count: 32)
    let second = try SecureRandom.bytes(count: 32)
    try check(first.count == 32 && first != second, "system random output must have requested size and differ")

    let encoded = try ReadyFrame(port: 49152, token: "opaque-token").encodedLine()
    try check(encoded.filter { $0 == "\n" }.count == 1 && encoded.hasSuffix("\n"), "startup frame must be one JSON line")
    try check(!encoded.contains("debug"), "startup frame must not include logs")

    let body = Data("{\"bytes\":32,\"purpose\":\"vault-dek\"}".utf8)
    let header = Data((
        "POST /v1/random HTTP/1.1\r\n" +
        "Content-Type: application/json\r\n" +
        "Content-Length: \(body.count)\r\n" +
        "Authorization: Bearer correct-token\r\n\r\n"
    ).utf8)
    guard case .incomplete = TransportServer.parseRequest(header) else {
        throw ContractTestFailure(description: "header-only TCP chunk must remain incomplete")
    }
    var splitFrame = header
    splitFrame.append(body.prefix(5))
    guard case .incomplete = TransportServer.parseRequest(splitFrame) else {
        throw ContractTestFailure(description: "partial JSON TCP chunk must remain incomplete")
    }
    splitFrame.append(body.dropFirst(5))
    guard case .complete(let path, let authorization, let parsedBody) = TransportServer.parseRequest(splitFrame) else {
        throw ContractTestFailure(description: "complete split request must parse")
    }
    try check(path == "/v1/random", "parsed request path must match")
    try check(authorization == "Bearer correct-token", "parsed authorization must match")
    try check(parsedBody == body, "parsed split body must match")

    let liveness = LivenessState(parentPID: 999_999, idleTimeout: 1)
    try check(liveness.shouldExit(parentIsAlive: false), "parent loss must request exit")
    liveness.requestShutdown()
    try check(liveness.shouldExit(parentIsAlive: true), "authenticated shutdown must request exit")
}
