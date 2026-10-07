import Foundation
import UIKit
import NISdk

/// Applies NISdk 6.1.0 card colours from Swift.
///
/// Generated ObjC interface for `NISdkColors` only exposes `-init`.
/// Colour fields are public Swift properties, not `@objc`.
/// `NISdk.setSDKColors(sdkColors:)` is `@objc public`.
@objc(NiSdkColorConfigurator)
public final class NiSdkColorConfigurator: NSObject {
    private static var mutation: Int = 0

    @objc public static func applyColors(_ colors: [AnyHashable: Any]?) {
        mutation += 1
        let token = mutation
        DispatchQueue.main.async {
            guard token == mutation else {
                return
            }
            let sdkColors = NISdkColors()
            if let colors = colors {
                Self.assignPublicColors(colors, to: sdkColors)
            }
            NISdk.sharedInstance.setSDKColors(sdkColors: sdkColors)
        }
    }

    @objc public static func resetColors() {
        mutation += 1
        let token = mutation
        DispatchQueue.main.async {
            guard token == mutation else {
                return
            }
            NISdk.sharedInstance.setSDKColors(sdkColors: NISdkColors())
        }
    }

    private static func assignPublicColors(_ colors: [AnyHashable: Any], to sdkColors: NISdkColors) {
        if let color = Self.color(fromHex: colors["payButtonBackgroundColor"]) {
            sdkColors.payButtonBackgroundColor = color
        }
        if let color = Self.color(fromHex: colors["payButtonTitleColor"]) {
            sdkColors.payButtonTitleColor = color
        }
        if let color = Self.color(fromHex: colors["payPageBackgroundColor"]) {
            sdkColors.payPageBackgroundColor = color
        }
        if let color = Self.color(fromHex: colors["payPageLabelColor"]) {
            sdkColors.payPageLabelColor = color
        }
        if let color = Self.color(fromHex: colors["payPageTitleColor"]) {
            sdkColors.payPageTitleColor = color
        }
        if let color = Self.color(fromHex: colors["textFieldLabelColor"]) {
            sdkColors.textFieldLabelColor = color
        }
    }

    private static func color(fromHex value: Any?) -> UIColor? {
        guard let hex = value as? String else {
            return nil
        }
        var clean = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if clean.hasPrefix("#") {
            clean.removeFirst()
        }
        guard clean.count == 6, let rgb = UInt32(clean, radix: 16) else {
            return nil
        }
        return UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
            green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
            blue: CGFloat(rgb & 0xFF) / 255.0,
            alpha: 1.0
        )
    }
}
