import Foundation

func runHTTPClientTests() async throws {
    try UpstreamPolicy.validate(URL(string: "https://provider.example/v1")!)
    try UpstreamPolicy.validate(URL(string: "http://127.0.0.1:11434/api/chat")!)
    try expectFailure("remote plaintext HTTP must be rejected") {
        try UpstreamPolicy.validate(URL(string: "http://provider.example/v1")!)
    }
    try expectFailure("URL credentials must be rejected") {
        try UpstreamPolicy.validate(URL(string: "https://user:pass@provider.example/v1")!)
    }
    try expectFailure("non-HTTP schemes must be rejected") {
        try UpstreamPolicy.validate(URL(string: "file:///tmp/private")!)
    }

    let original = URL(string: "https://provider.example/v1")!
    try check(UpstreamPolicy.sameOrigin(original, URL(string: "https://provider.example/v2")!), "same-origin redirect should be allowed")
    try check(!UpstreamPolicy.sameOrigin(original, URL(string: "https://evil.example/v2")!), "cross-origin redirect must be rejected")

    let selected = UpstreamPolicy.selectedHeaders([
        "Retry-After": "2",
        "X-Request-ID": "safe-id",
        "Authorization": "secret",
        "Set-Cookie": "secret-cookie",
    ])
    try check(selected == ["retry-after": "2", "x-request-id": "safe-id"], "response headers must be allowlisted")

    let client = HTTPClient()
    let cancellation = await client.cancel(jobID: "unknown")
    try check(cancellation == .unknown, "cancellation must address the exact job")
    try expectFailure("invalid jobs must fail before transport") {
        _ = try TransportRequest(
            jobID: "",
            method: "POST",
            url: "https://example.test",
            headers: [:],
            body: Data(),
            timeoutMilliseconds: 1_000,
            maxResponseBytes: 1_024
        ).validated()
    }

    try check(
        HTTPClient.classify(URLError(.timedOut)) == .timedOut,
        "upstream timeouts must retain a safe timeout classification"
    )
    try check(
        HTTPClient.classify(URLError(.cannotConnectToHost)) == .upstreamNetwork,
        "upstream connection failures must retain a safe network classification"
    )
    let timeoutResponse = ProtocolHandler.errorResponse(for: TransportProtocolError.timedOut)
    try check(timeoutResponse.statusCode == 504, "timeout RPC responses must use 504")
    try check(
        String(decoding: timeoutResponse.body, as: UTF8.self).contains("upstream-timeout"),
        "timeout RPC responses must expose only the stable safe code"
    )
}
