import Foundation

final class BlockingURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var active: [ObjectIdentifier: BlockingURLProtocol] = [:]
    nonisolated(unsafe) private static var totalStarted = 0

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.withLock {
            Self.active[ObjectIdentifier(self)] = self
            Self.totalStarted += 1
        }
    }

    override func stopLoading() {
        let removed = Self.lock.withLock {
            Self.active.removeValue(forKey: ObjectIdentifier(self)) != nil
        }
        if removed { client?.urlProtocol(self, didFailWithError: URLError(.cancelled)) }
    }

    static func reset() {
        lock.withLock {
            active.removeAll()
            totalStarted = 0
        }
    }

    static func startedCount() -> Int { lock.withLock { totalStarted } }

    static func waitUntilStarted(_ count: Int) async -> Bool {
        for _ in 0..<200 {
            if startedCount() >= count { return true }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return false
    }

    static func completeAll(body: Data = Data("{}".utf8)) {
        let protocols = lock.withLock {
            let values = Array(active.values)
            active.removeAll()
            return values
        }
        for item in protocols {
            let response = HTTPURLResponse(
                url: item.request.url!,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
            item.client?.urlProtocol(item, didReceive: response, cacheStoragePolicy: .notAllowed)
            item.client?.urlProtocol(item, didLoad: body)
            item.client?.urlProtocolDidFinishLoading(item)
        }
    }
}

func makeControlledHTTPClient() -> HTTPClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [BlockingURLProtocol.self]
    return HTTPClient(systemConfiguration: configuration)
}

func makeTransportRequest(
    jobID: String = UUID().uuidString,
    maximumResponseBytes: Int = 1_024
) -> TransportRequest {
    TransportRequest(
        jobID: jobID,
        method: "POST",
        url: "https://provider.example/v1",
        headers: [:],
        proxyMode: "system",
        body: Data("{}".utf8),
        timeoutMilliseconds: 5_000,
        maxResponseBytes: maximumResponseBytes
    )
}

func encodedTransportRequest(jobID: String) throws -> Data {
    try JSONSerialization.data(withJSONObject: [
        "jobId": jobID,
        "method": "POST",
        "url": "https://provider.example/v1",
        "headers": [:],
        "proxyMode": "system",
        "body": [:],
        "timeoutMs": 5_000,
        "maxResponseBytes": 1_024,
    ])
}

func runHTTPClientTests() async throws {
    let sanitizedEnvironment = ProxyEnvironment.sanitized([
        "PATH": "/usr/bin",
        "HTTPS_PROXY": "http://127.0.0.1:10808",
        "all_proxy": "socks5://127.0.0.1:10808",
        "NO_PROXY": "localhost",
    ])
    try check(
        sanitizedEnvironment == ["PATH": "/usr/bin", "NO_PROXY": "localhost"],
        "the helper must relaunch without inherited HTTP/SOCKS proxy variables"
    )

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
    try check(
        HTTPClient.transportKind(for: "direct") == .libcurl,
        "direct mode must use the explicit no-proxy libcurl transport"
    )
    try check(
        HTTPClient.transportKind(for: "system") == .urlSession,
        "system mode must continue to use macOS URLSession proxy settings"
    )
    try check(
        HTTPClient.maximumConnectionsPerHost == 4,
        "the shared system session must cap each host at four connections"
    )
    try check(
        client.systemSessionMaximumConnectionsPerHost() == 4,
        "the configured system session must apply the host connection cap"
    )
    try check(
        client.systemSessionIdentity() == client.systemSessionIdentity(),
        "system requests must reuse one helper-owned session"
    )
    let cancellation = await client.cancel(jobID: "unknown")
    try check(cancellation == .unknown, "cancellation must address the exact job")
    try expectFailure("invalid jobs must fail before transport") {
        _ = try TransportRequest(
            jobID: "",
            method: "POST",
            url: "https://example.test",
            headers: [:],
            proxyMode: "system",
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

    let redirectSession = URLSession(configuration: .ephemeral)
    let redirectTask = redirectSession.dataTask(with: original)
    let redirectResponse = HTTPURLResponse(
        url: original,
        statusCode: 302,
        httpVersion: "HTTP/1.1",
        headerFields: nil
    )!
    let redirectDelegate = RedirectDelegate(originalURL: original)
    for index in 1...3 {
        var decision: URLRequest?
        redirectDelegate.urlSession(
            redirectSession,
            task: redirectTask,
            willPerformHTTPRedirection: redirectResponse,
            newRequest: URLRequest(url: URL(string: "https://provider.example/v\(index + 1)")!),
            completionHandler: { decision = $0 }
        )
        try check(decision != nil, "each request must allow its first three same-origin redirects")
    }
    var fourthDecision: URLRequest?
    redirectDelegate.urlSession(
        redirectSession,
        task: redirectTask,
        willPerformHTTPRedirection: redirectResponse,
        newRequest: URLRequest(url: URL(string: "https://provider.example/v5")!),
        completionHandler: { fourthDecision = $0 }
    )
    try check(fourthDecision == nil, "redirect limits must be scoped to one request")
    let independentDelegate = RedirectDelegate(originalURL: original)
    var independentDecision: URLRequest?
    independentDelegate.urlSession(
        redirectSession,
        task: redirectTask,
        willPerformHTTPRedirection: redirectResponse,
        newRequest: URLRequest(url: URL(string: "https://provider.example/independent")!),
        completionHandler: { independentDecision = $0 }
    )
    try check(independentDecision != nil, "a different request must have an independent redirect count")
    var crossOriginDecision: URLRequest?
    independentDelegate.urlSession(
        redirectSession,
        task: redirectTask,
        willPerformHTTPRedirection: redirectResponse,
        newRequest: URLRequest(url: URL(string: "https://other.example/v1")!),
        completionHandler: { crossOriginDecision = $0 }
    )
    try check(crossOriginDecision == nil, "cross-origin redirects must remain rejected")
    redirectSession.invalidateAndCancel()

    BlockingURLProtocol.reset()
    let controlledClient = makeControlledHTTPClient()
    let requests = (0..<5).map { _ in makeTransportRequest() }
    let work = requests.map { request in
        Task { try await controlledClient.perform(request) }
    }
    let reachedConnectionAllowance = await BlockingURLProtocol.waitUntilStarted(4)
    try check(
        reachedConnectionAllowance,
        "four requests should be able to occupy the host connection allowance"
    )
    let queuedCancellation = await controlledClient.cancel(jobID: requests[4].jobID)
    try check(queuedCancellation == .cancelled, "a queued request must retain exact cancellation identity")
    BlockingURLProtocol.completeAll()
    for task in work.prefix(4) {
        let response = try await task.value
        try check(response.statusCode == 200, "cancelling one request must not affect its peers")
    }
    do {
        _ = try await work[4].value
        throw ContractTestFailure(description: "a cancelled queued request must not complete successfully")
    } catch is CancellationError {}
    let repeatedCancellation = await controlledClient.cancel(jobID: requests[4].jobID)
    try check(
        repeatedCancellation == .alreadyCompleted,
        "completion and cancellation must produce one stable terminal state"
    )
    controlledClient.close()

    BlockingURLProtocol.reset()
    let sizeClient = makeControlledHTTPClient()
    let sizeTask = Task {
        try await sizeClient.perform(makeTransportRequest(maximumResponseBytes: 1))
    }
    let sizeRequestStarted = await BlockingURLProtocol.waitUntilStarted(1)
    try check(sizeRequestStarted, "the response-size test must reach the shared session")
    BlockingURLProtocol.completeAll()
    do {
        _ = try await sizeTask.value
        throw ContractTestFailure(description: "oversized system responses must be rejected")
    } catch TransportProtocolError.responseTooLarge {}
    sizeClient.close()

    BlockingURLProtocol.reset()
    let immediateCancellationClient = makeControlledHTTPClient()
    let immediateTask = Task {
        try await immediateCancellationClient.perform(makeTransportRequest())
    }
    immediateTask.cancel()
    do {
        _ = try await immediateTask.value
        throw ContractTestFailure(description: "immediate cancellation must not start a successful request")
    } catch is CancellationError {}
    try check(
        immediateCancellationClient.activeJobCount() == 0,
        "cancellation before network task installation must clear the exact job"
    )
    immediateCancellationClient.close()
}
