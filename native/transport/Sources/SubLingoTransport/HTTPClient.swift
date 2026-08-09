@preconcurrency import Foundation

enum UpstreamPolicy {
    static func validate(_ url: URL) throws {
        guard url.user == nil, url.password == nil, url.fragment == nil,
              let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(),
              ["http", "https"].contains(scheme)
        else { throw TransportProtocolError.forbiddenDestination }
        let isLoopback = host == "127.0.0.1" || host == "::1" || host == "localhost"
        guard scheme == "https" || (scheme == "http" && isLoopback) else {
            throw TransportProtocolError.forbiddenDestination
        }
    }

    static func sameOrigin(_ lhs: URL, _ rhs: URL) -> Bool {
        lhs.scheme?.lowercased() == rhs.scheme?.lowercased()
            && lhs.host?.lowercased() == rhs.host?.lowercased()
            && effectivePort(lhs) == effectivePort(rhs)
    }

    static func selectedHeaders(_ headers: [AnyHashable: Any]) -> [String: String] {
        let allowed = Set(["retry-after", "x-request-id", "content-type"])
        return headers.reduce(into: [:]) { result, pair in
            let name = String(describing: pair.key).lowercased()
            guard allowed.contains(name) else { return }
            let value = String(describing: pair.value)
            guard value.count <= 1_024, !value.contains("\n"), !value.contains("\r") else { return }
            result[name] = value
        }
    }

    private static func effectivePort(_ url: URL) -> Int? {
        url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80)
    }
}

private final class RedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let originalURL: URL
    private var redirects = 0

    init(originalURL: URL) { self.originalURL = originalURL }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        redirects += 1
        guard redirects <= 3, let target = request.url,
              UpstreamPolicy.sameOrigin(originalURL, target)
        else {
            completionHandler(nil)
            return
        }
        completionHandler(request)
    }
}

final class HTTPClient: @unchecked Sendable {
    private struct ActiveJob {
        let task: URLSessionDataTask
        let session: URLSession
    }

    private let lock = NSLock()
    private var active: [String: ActiveJob] = [:]
    private var completed: Set<String> = []

    func perform(_ rawRequest: TransportRequest) async throws -> TransportResponse {
        let request = try rawRequest.validated()
        guard let url = URL(string: request.url) else { throw TransportProtocolError.invalidRequest }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method
        urlRequest.httpBody = request.body.isEmpty ? nil : request.body
        urlRequest.timeoutInterval = Double(request.timeoutMilliseconds) / 1_000
        for (name, value) in request.headers { urlRequest.setValue(value, forHTTPHeaderField: name) }

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let configuration = URLSessionConfiguration.ephemeral
                configuration.timeoutIntervalForRequest = Double(request.timeoutMilliseconds) / 1_000
                configuration.timeoutIntervalForResource = Double(request.timeoutMilliseconds) / 1_000
                configuration.httpShouldSetCookies = false
                configuration.urlCache = nil
                let delegate = RedirectDelegate(originalURL: url)
                let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
                let task = session.dataTask(with: urlRequest) { [weak self] data, response, error in
                    guard let self else { return }
                    self.finish(jobID: request.jobID)
                    defer { session.finishTasksAndInvalidate() }
                    if let error = error as? URLError, error.code == .cancelled {
                        continuation.resume(throwing: CancellationError())
                        return
                    }
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    guard let http = response as? HTTPURLResponse else {
                        continuation.resume(throwing: TransportProtocolError.invalidRequest)
                        return
                    }
                    let body = data ?? Data()
                    guard body.count <= request.maxResponseBytes else {
                        continuation.resume(throwing: TransportProtocolError.responseTooLarge)
                        return
                    }
                    continuation.resume(returning: TransportResponse(
                        jobID: request.jobID,
                        transportState: "completed",
                        statusCode: http.statusCode,
                        headers: UpstreamPolicy.selectedHeaders(http.allHeaderFields),
                        body: body
                    ))
                }
                let inserted = self.lock.withLock { () -> Bool in
                    guard self.active[request.jobID] == nil else { return false }
                    self.active[request.jobID] = ActiveJob(task: task, session: session)
                    return true
                }
                guard inserted else {
                    session.invalidateAndCancel()
                    continuation.resume(throwing: TransportProtocolError.duplicateJob)
                    return
                }
                task.resume()
            }
        } onCancel: {
            _ = self.cancelSync(jobID: request.jobID)
        }
    }

    func cancel(jobID: String) async -> CancelState { cancelSync(jobID: jobID) }

    func activeJobCount() -> Int { lock.withLock { active.count } }

    private func cancelSync(jobID: String) -> CancelState {
        let job = lock.withLock { active.removeValue(forKey: jobID) }
        if let job {
            job.task.cancel()
            job.session.invalidateAndCancel()
            _ = lock.withLock { completed.insert(jobID) }
            return .cancelled
        }
        return lock.withLock { completed.contains(jobID) ? .alreadyCompleted : .unknown }
    }

    private func finish(jobID: String) {
        lock.withLock {
            active.removeValue(forKey: jobID)
            completed.insert(jobID)
            if completed.count > 1_024 { completed.removeAll(keepingCapacity: true) }
        }
    }
}
