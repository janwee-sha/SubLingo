// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SubLingoTransport",
    platforms: [.macOS(.v12)],
    products: [
        .executable(name: "sublingo-transport", targets: ["SubLingoTransport"])
    ],
    targets: [
        .executableTarget(name: "SubLingoTransport")
    ]
)
