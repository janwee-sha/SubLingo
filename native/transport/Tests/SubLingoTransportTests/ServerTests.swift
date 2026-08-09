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

    let liveness = LivenessState(parentPID: 999_999, idleTimeout: 1)
    try check(liveness.shouldExit(parentIsAlive: false), "parent loss must request exit")
    liveness.requestShutdown()
    try check(liveness.shouldExit(parentIsAlive: true), "authenticated shutdown must request exit")
}
