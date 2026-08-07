import Foundation
import CoreGraphics

typealias GetBrightness = @convention(c) (UInt32, UnsafeMutablePointer<Float>) -> Int32
typealias SetBrightness = @convention(c) (UInt32, Float) -> Int32

guard let handle = dlopen("/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices", RTLD_LAZY) else {
    fputs("error: cannot load DisplayServices\n", stderr)
    exit(1)
}

let display = CGMainDisplayID()

switch CommandLine.arguments.dropFirst().first {
case "get":
    let sym = dlsym(handle, "DisplayServicesGetBrightness")!
    let getBrightness = unsafeBitCast(sym, to: GetBrightness.self)
    var brightness: Float = 0
    if getBrightness(display, &brightness) == 0 {
        print(String(format: "%.4f", brightness))
    } else {
        fputs("error: DisplayServicesGetBrightness failed\n", stderr)
        exit(1)
    }
case "set":
    guard let arg = CommandLine.arguments.dropFirst().dropFirst().first,
          let value = Float(arg), (0...1).contains(value) else {
        fputs("usage: brightness set <0.0-1.0>\n", stderr)
        exit(1)
    }
    let sym = dlsym(handle, "DisplayServicesSetBrightness")!
    let setBrightness = unsafeBitCast(sym, to: SetBrightness.self)
    if setBrightness(display, value) != 0 {
        fputs("error: DisplayServicesSetBrightness failed\n", stderr)
        exit(1)
    }
default:
    fputs("usage: brightness get | set <0.0-1.0>\n", stderr)
    exit(1)
}
