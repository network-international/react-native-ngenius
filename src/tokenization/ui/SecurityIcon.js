import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

// Paths reused from the Hosted Sessions Museum checkout preview shell.
export default function SecurityIcon({ kind = 'shield', color = '#58825C', size = 16, testID }) {
  return kind === 'lock' ? (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 16 16" fill="none" accessible={false}>
      <Path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" stroke={color} strokeWidth={1.4} />
      <Rect x={3} y={7} width={10} height={7} rx={2} stroke={color} strokeWidth={1.4} />
    </Svg>
  ) : (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 18 18" fill="none" accessible={false}>
      <Path d="M9 1.5 15 4v4.8c0 4-6 7.7-6 7.7S3 12.8 3 8.8V4z" stroke={color} strokeWidth={1.4} />
      <Path d="m6 8.5 2 2 4-4" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}
