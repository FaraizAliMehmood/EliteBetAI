import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppView } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface NavigationProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  t: (key: string) => string;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, setView, t }) => {
  const insets = useSafeAreaInsets();

  const mainTabs = [
    { 
      id: AppView.DASHBOARD, 
      label: t('home'), 
      icon: (
        <Path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2.2} 
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" 
        />
      ),
    },
    { 
      id: AppView.SAVED, 
      label: t('saved'), 
      icon: (
        <Path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2.2} 
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" 
        />
      ),
    },
    { 
      id: AppView.SETTINGS, 
      label: t('settings'), 
      icon: (
        <Path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2.2} 
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M12 15a3 3 0 100-6 3 3 0 000 6z" 
        />
      ),
    },
  ];

  return (
    <View 
      className="absolute bottom-0 left-0 right-0 px-6 flex-row items-center justify-between gap-3 z-50"
      style={{ paddingBottom: Math.max(insets.bottom, 32) }}
    >
      <View className="flex-1 flex-row items-center justify-around h-[76px] bg-[#0a0a0b] rounded-[38px] border border-white/10 px-2" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 12 }}>
        {mainTabs.map((tab) => {
          const isActive = currentView === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                triggerHaptic('light');
                setView(tab.id);
              }}
              className={`flex-1 h-[60px] flex-col items-center justify-center gap-1 rounded-[30px] ${
                isActive ? 'bg-white/10' : ''
              }`}
              style={({ pressed }) => [
                {
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <Svg 
                width={22} 
                height={22} 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke={isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)'}
              >
                {tab.icon}
              </Svg>
              <Text 
                className={`text-[10px] font-bold tracking-tight ${
                  isActive ? 'text-white' : 'text-white/40'
                }`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          triggerHaptic('medium');
          setView(AppView.SCAN);
        }}
        className={`w-[76px] h-[76px] bg-white/5 rounded-full flex-col items-center justify-center border border-white/10 shrink-0 ${
          currentView === AppView.SCAN ? 'bg-white/15' : ''
        }`}
        style={({ pressed }) => [
          {
            transform: [{ scale: pressed ? 0.90 : 1 }],
          },
          { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 12 }
        ]}
      >
        <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF">
          <Path d="M7 3H5C3.89543 3 3 3.89543 3 5V7" strokeWidth="2.8" strokeLinecap="round" />
          <Path d="M17 3H19C20.1046 3 21 3.89543 21 5V7" strokeWidth="2.8" strokeLinecap="round" />
          <Path d="M7 21H5C3.89543 21 3 20.1046 3 19V17" strokeWidth="2.8" strokeLinecap="round" />
          <Path d="M17 21H19C20.1046 21 21 20.1046 21 19V17" strokeWidth="2.8" strokeLinecap="round" />
        </Svg>
      </Pressable>
    </View>
  );
};

export default memo(Navigation);
