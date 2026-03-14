// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SpeechHelper",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "SpeechHelper",
            path: "Sources/SpeechHelper",
            swiftSettings: [
                .unsafeFlags(["-O", "-whole-module-optimization"])
            ]
        )
    ]
)
