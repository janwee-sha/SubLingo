// swift-tools-version: 6.0
import Foundation
import PackageDescription

let ffmpegPrefix = ProcessInfo.processInfo.environment["SUBLINGO_FFMPEG_PREFIX"] ?? ""
let ffmpegInclude = "\(ffmpegPrefix)/include"
let ffmpegLibrary = "\(ffmpegPrefix)/lib"

let package = Package(
    name: "SubLingoSubtitleExtractor",
    platforms: [.macOS(.v12)],
    products: [
        .executable(name: "sublingo-subtitle-extractor", targets: ["SubLingoSubtitleExtractor"])
    ],
    targets: [
        .systemLibrary(name: "CFFmpeg", path: "Sources/CFFmpeg"),
        .executableTarget(
            name: "SubLingoSubtitleExtractor",
            dependencies: ["CFFmpeg"],
            swiftSettings: [
                .swiftLanguageMode(.v6),
                .unsafeFlags(["-Xcc", "-I\(ffmpegInclude)"])
            ],
            linkerSettings: [
                .unsafeFlags([
                    "-L", ffmpegLibrary,
                    "-lavformat", "-lavcodec", "-lavutil", "-lz",
                    "-framework", "CoreFoundation",
                    "-framework", "CoreMedia",
                    "-framework", "Security",
                    "-framework", "VideoToolbox"
                ])
            ]
        ),
        .testTarget(
            name: "SubLingoSubtitleExtractorTests",
            dependencies: ["SubLingoSubtitleExtractor"],
            swiftSettings: [
                .swiftLanguageMode(.v6),
                .unsafeFlags(["-Xcc", "-I\(ffmpegInclude)"])
            ],
            linkerSettings: [
                .unsafeFlags([
                    "-L", ffmpegLibrary,
                    "-lavformat", "-lavcodec", "-lavutil", "-lz",
                    "-framework", "CoreFoundation",
                    "-framework", "CoreMedia",
                    "-framework", "Security",
                    "-framework", "VideoToolbox"
                ])
            ]
        )
    ],
    swiftLanguageModes: [.v6]
)
