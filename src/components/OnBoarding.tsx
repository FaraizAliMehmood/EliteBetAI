import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { triggerHaptic } from '../utils/haptics';

interface OnboardingProps {
  onComplete: () => void;
  t: (key: string) => string;
}

interface PaginationDotProps {
  isActive: boolean;
}

const PaginationDot: React.FC<PaginationDotProps> = ({ isActive }) => {
  const animatedStyle = useAnimatedStyle(() => ({
    width: withTiming(isActive ? 32 : 4, { duration: 300 }),
  }));

  return (
    <Animated.View
      className={`h-1 rounded-full ${isActive ? 'bg-blue-500' : 'bg-white/10'}`}
      style={animatedStyle}
    />
  );
};

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, t }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: "Neural Synthesis",
      description: "Harness the power of elite predictive intelligence. Our tactical engine synthesizes thousands of data points to find the invisible edge.",
      icon: (
        <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={1.5}>
          <Path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.364-6.364l-.707-.707M6.707 17.293l.707-.707M18 12a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </Svg>
      ),
      accent: "The Elite Standard"
    },
    {
      title: "AI Vision Intel",
      description: "Point your camera at any game or betting ticket. Our Vision Mode instantly identifies fixtures and provides deep analytics.",
      icon: (
        <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={1.5}>
          <Path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <Path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </Svg>
      ),
      accent: "Real-Time Clarity"
    },
    {
      title: "Master The Edge",
      description: "Join the top 1% of analysts. With 90%+ predictive models, EliteBet AI is your professional-grade companion for sports mastery.",
      icon: (
        <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={1.5}>
          <Path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </Svg>
      ),
      accent: "Predictive Mastery"
    }
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      triggerHaptic('selection');
      setCurrentSlide(prev => prev + 1);
    } else {
      triggerHaptic('success');
      onComplete();
    }
  };

  return (
    <View className="absolute inset-0 z-[1000] bg-black flex flex-col items-center justify-between px-8 py-16 overflow-hidden">
      {/* Background Orbs - Isolated from slide content key to prevent re-rendering stutter */}
      <View className="absolute inset-0 pointer-events-none overflow-hidden">
        <View className="absolute top-[-10%] left-[-10%] w-full h-[50%] bg-blue-600/15 rounded-full" style={{ shadowColor: '#2563EB', shadowRadius: 140, shadowOpacity: 0.5 }} />
        <View className="absolute bottom-[-10%] right-[-10%] w-full h-[50%] bg-indigo-600/10 rounded-full" style={{ shadowColor: '#4F46E5', shadowRadius: 140, shadowOpacity: 0.5 }} />
      </View>

      <View className="flex-1 w-full flex flex-col items-center justify-center text-center max-w-sm z-10">
        <Animated.View
          key={currentSlide}
          entering={FadeIn.duration(400)}
          exiting={FadeOut.duration(200)}
          className="flex flex-col items-center"
        >
          <View className="w-24 h-24 rounded-[36px] bg-white/5 border border-white/10 flex items-center justify-center mb-8 relative" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }}>
            <View className="absolute inset-0 bg-blue-500/10 rounded-full" style={{ shadowColor: '#3B82F6', shadowRadius: 8, shadowOpacity: 0.5 }} />
            {slides[currentSlide].icon}
          </View>
          
          <Text className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3">
            {slides[currentSlide].accent}
          </Text>
          
          <Text className="text-[28px] font-bold text-white tracking-tight leading-tight mb-4">
            {slides[currentSlide].title}
          </Text>
          
          <Text className="text-[15px] text-white/50 leading-relaxed font-medium px-4">
            {slides[currentSlide].description}
          </Text>
        </Animated.View>
      </View>

      <View className="w-full max-w-sm space-y-8 flex flex-col items-center z-10">
        {/* Pagination Dots */}
        <View className="flex flex-row gap-2">
          {slides.map((_, i) => (
            <PaginationDot key={i} isActive={currentSlide === i} />
          ))}
        </View>

        <Pressable
          onPress={handleNext}
          className="w-full h-16 rounded-[24px] bg-white flex items-center justify-center"
          style={({ pressed }) => [
            {
              transform: [{ scale: pressed ? 0.96 : 1 }],
              opacity: pressed ? 0.8 : 1,
            },
            { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }
          ]}
        >
          <Text className="text-black font-black text-[17px]">
            {currentSlide === slides.length - 1 ? "Get Started" : "Continue"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

export default Onboarding;
