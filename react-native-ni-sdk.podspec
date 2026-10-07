require "json"
package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-ni-sdk"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.description  = <<-DESC
                  react-native-ngenius
                   DESC
  s.homepage     = "https://github.com/network-international/react-native-ngenius"
  # brief license entry:
  s.license      = "MIT"
  s.authors      = { "Johnny Peter" => "jpeter@equalexperts.com" }
  s.platforms    = { :ios => "14.0" }
  s.source       = { :git => "https://github.com/network-international/react-native-ngenius.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,c,m,swift}"
  s.requires_arc = true
  s.swift_version = "5.0"
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "IPHONEOS_DEPLOYMENT_TARGET" => "14.0",
    "SWIFT_INCLUDE_PATHS" => '$(inherited) "${PODS_CONFIGURATION_BUILD_DIR}/NISdk"',
    "OTHER_SWIFT_FLAGS" => '$(inherited) -D COCOAPODS -I "${PODS_CONFIGURATION_BUILD_DIR}/NISdk" -Xcc -fmodule-map-file="${PODS_CONFIGURATION_BUILD_DIR}/NISdk/NISdk.modulemap"'
  }

  s.dependency "React"
  s.dependency "NISdk", "6.1.0"
end
