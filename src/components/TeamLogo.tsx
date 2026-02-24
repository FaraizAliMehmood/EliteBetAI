import React, { memo, useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

interface TeamLogoProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_PX = { sm: 32, md: 56, lg: 80 } as const;

const TeamLogo: React.FC<TeamLogoProps> = ({
  src,
  alt,
  size = 'md',
}) => {
  const [error, setError] = useState(false);

  const dimension = SIZE_PX[size];
  const radius = dimension / 2;

  const isValidRemoteUri =
    !!src && typeof src === 'string' && /^https?:\/\//i.test(src);

  const showFallback = !isValidRemoteUri || error;
  const fallbackInitial = alt?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <View
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        backgroundColor: '#222',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showFallback ? (
        <Text style={styles.fallbackText}>{fallbackInitial}</Text>
      ) : (
        <Image
          key={src}
          source={{ uri: src }}
          resizeMode="contain"
          onError={() => setError(true)}
          style={{
            width: dimension,
            height: dimension,
            borderRadius: radius,
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fallbackText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default memo(TeamLogo);
