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
  s.platforms    = { :ios => "11.0" }
  s.source       = { :git => "https://github.com/network-international/react-native-ngenius.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,c,m,swift}"
  s.requires_arc = true

  s.dependency "React"
  s.dependency "NISdk", "5.0.0"
end
