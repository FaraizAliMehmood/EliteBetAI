import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SavedPrediction } from '../types';
import { triggerHaptic } from '../utils/haptics';
import TeamLogo from './TeamLogo';

interface HistoryViewProps {
  history: SavedPrediction[];
  onDelete: (id: string) => void;
  t: (key: string) => string;
}

const HistoryView: React.FC<HistoryViewProps> = ({ history, onDelete, t }) => {
  const stats = useMemo(() => {
    const settled = history.filter(h => h.status !== 'pending');
    return { settledCount: settled.length };
  }, [history]);

  const handleDelete = (id: string) => {
    triggerHaptic('medium');
    onDelete(id);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const TrashIcon = ({ size = 16, color = '#ef4444' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </Svg>
  );

  const ClipboardIcon = ({ size = 24, color = 'rgba(59, 130, 246, 0.4)' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </Svg>
  );

  return (
    <ScrollView className="flex-1 pb-20" showsVerticalScrollIndicator={false}>
      <View className="flex-col gap-6 px-1 pt-6">
        <View className="flex-row justify-between items-end px-1">
          <View>
            <Text className="text-[22px] font-bold tracking-tight text-white leading-tight">
              {t('savedInsights')}
            </Text>
           
          </View>
        </View>
        <View className="flex-col gap-3">
          {history.length === 0 ? (
            <View className="flex-col items-center justify-center py-16 text-center glass rounded-[28px] border-white/5 px-8">
              <View className="w-12 h-12 bg-blue-500/5 rounded-full flex items-center justify-center mb-4">
                <ClipboardIcon size={24} color="rgba(59, 130, 246, 0.4)" />
              </View>
              <Text className="text-[15px] font-bold text-white tracking-tight">
                {t('noTracked')}
              </Text>
              <Text className="text-[13px] text-[#8e8e93] mt-1.5 leading-snug font-normal tracking-tight">
                {t('savePredictionsDesc')}
              </Text>
            </View>
          ) : (
            history.map(prediction => (
              <Pressable
                key={prediction.id}
                className="glass rounded-[20px] p-4 flex-row justify-between items-center border border-white/5 relative overflow-hidden active:bg-white/5"
                onPress={() => triggerHaptic('light')}
              >
                <View className="flex-row gap-3.5 relative z-10 flex-1">
                  <View className="flex-row shrink-0">
                    <TeamLogo
                      src={prediction.homeLogo || ''}
                      alt={prediction.homeTeam || ''}
                      size="sm"
                      className="ring-2 ring-black"
                    />
                    <View style={{ marginLeft: -12 }}>
                      <TeamLogo
                        src={prediction.awayLogo || ''}
                        alt={prediction.awayTeam || ''}
                        size="sm"
                        className="ring-2 ring-black"
                      />
                    </View>
                  </View>
                  <View className="flex-col justify-center flex-1">
                    <Text
                      className="text-[14px] font-bold text-white tracking-tight leading-tight"
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {prediction.matchTitle}
                    </Text>
                    <Text
                      className="text-[11px] font-bold uppercase tracking-tight mt-0.5 text-white"
                    >
                      {prediction.selection}
                    </Text>
                    <Text className="text-[9px] text-white/30 font-bold mt-0.5 uppercase tracking-widest">
                      {formatDate(prediction.timestamp)} • {formatTime(prediction.timestamp)}
                    </Text>
                  </View>
                </View>
                <View className="flex-col items-end justify-center relative z-10 shrink-0 ml-2">
                  <Pressable
                    onPress={() => handleDelete(prediction.id)}
                    className="w-[24px] h-[24px] rounded-full flex items-center justify-center active:bg-red-500/20"
                  >
                    <TrashIcon size={18} color="#ef4444" />
                  </Pressable>
                  
                </View>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
};

export default HistoryView;
