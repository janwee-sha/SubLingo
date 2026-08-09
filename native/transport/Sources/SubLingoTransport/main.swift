import Darwin
import Foundation

enum SubLingoTransportMain {
    static func run() async throws {
        let arguments = CommandLine.arguments
        let parentPID: Int32?
        if let index = arguments.firstIndex(of: "--parent-pid"), arguments.indices.contains(index + 1) {
            parentPID = Int32(arguments[index + 1])
        } else {
            parentPID = nil
        }
        let token = try SecureRandom.token()
        let liveness = LivenessState(parentPID: parentPID)
        let server = try TransportServer(token: token, liveness: liveness)
        let port = try await server.start()
        FileHandle.standardOutput.write(Data(try ReadyFrame(port: port, token: token).encodedLine().utf8))

        while !liveness.shouldExit(parentIsAlive: liveness.actualParentIsAlive()) {
            try await Task.sleep(nanoseconds: 1_000_000_000)
        }
        server.stop()
    }
}

Task {
    do {
        try await SubLingoTransportMain.run()
        exit(EXIT_SUCCESS)
    } catch {
        exit(EXIT_FAILURE)
    }
}
dispatchMain()
