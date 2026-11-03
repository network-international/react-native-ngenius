import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';

const BrandingHeader = ({ theme, styles, testID }) => {
  const { logoUrl, footerText, capitalizeHeading } = theme.branding;
  const [logoFailed, setLogoFailed] = useState(false);
  const label = capitalizeHeading && footerText ? footerText.toUpperCase() : footerText;
  const showLogo = Boolean(logoUrl) && !logoFailed;

  return (
    <View style={styles.header} testID={testID}>
      {showLogo ? (
        <Image
          source={{ uri: logoUrl }}
          style={styles.logo}
          testID="tokenization-logo"
          accessibilityRole="image"
          onError={() => setLogoFailed(true)}
        />
      ) : null}
      {label ? <Text style={styles.footerText}>{label}</Text> : null}
    </View>
  );
};

export default BrandingHeader;
