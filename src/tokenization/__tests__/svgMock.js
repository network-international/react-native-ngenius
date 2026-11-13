// Jest has no native renderer. Keep the vector tree inspectable without loading
// react-native-svg's native view managers; production still imports the package.
module.exports = {
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Path: 'Path',
  G: 'G',
  Rect: 'Rect',
  Circle: 'Circle',
  Defs: 'Defs',
  ClipPath: 'ClipPath',
  LinearGradient: 'LinearGradient',
  RadialGradient: 'RadialGradient',
  Stop: 'Stop',
};
