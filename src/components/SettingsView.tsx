import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { LanguageCode } from '../translations';
import { triggerHaptic } from '../utils/haptics';

interface SettingsViewProps {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
  onPaywallToggle?: (isOpen: boolean) => void;
  forcePaywall?: boolean;
  onSubscriptionSuccess?: () => void;
  onSignOut?: () => void;
  /** When this changes, re-load subscription state from AsyncStorage (synced from RevenueCat) */
  subscriptionRefreshTrigger?: number;
}

const LANGUAGES: { code: LanguageCode; name: string }[] = [
  { code: 'en', name: 'English (US)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'nl', name: 'Nederlands (Dutch)' },
  { code: 'pt', name: 'Português (Portuguese)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'it', name: 'Italiano (Italian)' },
  { code: 'jp', name: '日本語 (Japanese)' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'zh', name: '简体中文 (Chinese)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'ko', name: '한국어 (Korean)' },
  { code: 'tr', name: 'Türkçe (Turkish)' },
  { code: 'pl', name: 'Polski (Polish)' },
  { code: 'sv', name: 'Svenska (Swedish)' },
  { code: 'da', name: 'Dansk (Danish)' },
  { code: 'no', name: 'Norsk (Norwegian)' },
  { code: 'fi', name: 'Suomi (Finnish)' },
  { code: 'el', name: 'Ελληνικά (Greek)' },
  { code: 'cs', name: 'Čeština (Czech)' },
  { code: 'hu', name: 'Magyar (Hungarian)' },
  { code: 'ro', name: 'Română (Romanian)' },
  { code: 'uk', name: 'Українська (Ukrainian)' },
  { code: 'th', name: 'ภาษาไทย (Thai)' },
  { code: 'vi', name: 'Tiếng Việt (Vietnamese)' },
  { code: 'id', name: 'Bahasa Indonesia (Indonesian)' },
  { code: 'ms', name: 'Bahasa Melayu (Malay)' },
  { code: 'hi', name: 'हिन्दी (Hindi)' },
  { code: 'bn', name: 'বাংলা (Bengali)' },
  { code: 'he', name: 'עברית (Hebrew)' },
  { code: 'bg', name: 'Български (Bulgarian)' },
  { code: 'sk', name: 'Slovenčina (Slovak)' },
  { code: 'hr', name: 'Hrvatski (Croatian)' },
  { code: 'sr', name: 'Српски (Serbian)' },
];

const PLAN_RANKS = {
  weekly: 1,
  monthly: 2,
  yearly: 3,
};

const SettingsView: React.FC<SettingsViewProps> = ({
  language,
  setLanguage,
  t,
  onPaywallToggle,
  forcePaywall,
  onSubscriptionSuccess,
  onSignOut,
  subscriptionRefreshTrigger = 0,
}) => {
  const insets = useSafeAreaInsets();
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(forcePaywall || false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalType, setLegalType] = useState<'terms' | 'privacy'>('terms');
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'success' | 'none'>('idle');
  const [selectedPlan, setSelectedPlan] = useState<'weekly' | 'monthly' | 'yearly'>('yearly');
  const [isVerifyingSubscription, setIsVerifyingSubscription] = useState(false);

  const [haptics, setHaptics] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<'weekly' | 'monthly' | 'yearly' | null>(null);
  const [defaultOffering, setDefaultOffering] = useState<PurchasesOffering | null>(null);
  const [offeringsLoading, setOfferingsLoading] = useState(false);

  // Load initial state from AsyncStorage (re-runs when subscription syncs from RevenueCat)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [hapticsValue, notificationsValue, currentPlanValue, proActiveValue] =
          await Promise.all([
            AsyncStorage.getItem('elitebet_haptics'),
            AsyncStorage.getItem('elitebet_notifications'),
            AsyncStorage.getItem('elitebet_current_plan'),
            AsyncStorage.getItem('elitebet_pro_active'),
          ]);

        setHaptics(hapticsValue !== 'false');
        setNotifications(notificationsValue === 'true');
        if (currentPlanValue) {
          setCurrentPlan(currentPlanValue as 'weekly' | 'monthly' | 'yearly');
        } else if (proActiveValue === 'true') {
          setCurrentPlan('yearly'); // Default fallback
        } else {
          setCurrentPlan(null);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };

    loadSettings();
  }, [subscriptionRefreshTrigger]);

  const isSubscribed = useMemo(() => !!currentPlan, [currentPlan]);

  useEffect(() => {
    if (forcePaywall) setIsPaywallOpen(true);
  }, [forcePaywall]);

  useEffect(() => {
    onPaywallToggle?.(isPaywallOpen);
  }, [isPaywallOpen, onPaywallToggle]);

  // RevenueCat: fetch default offering when paywall opens
  useEffect(() => {
    if (!isPaywallOpen) return;
    let cancelled = false;
    setOfferingsLoading(true);
    Purchases.getOfferings()
      .then((offerings) => {
        if (cancelled) return;
        const offering = offerings.all['elite'] ?? offerings.current ?? null;
        
        setDefaultOffering(offering);
      })
      .catch((error) => {
        if (!cancelled) console.warn('[RevenueCat] Failed to get offerings:', error);
      })
      .finally(() => {
        if (!cancelled) setOfferingsLoading(false);
      });
    return () => { cancelled = true; };
  }, [isPaywallOpen]);

  // When offering loads, select first available package if current selection has none
  useEffect(() => {
    if (!defaultOffering) return;
    if (getPackageForPlan(selectedPlan)) return;
    if (defaultOffering.annual) setSelectedPlan('yearly');
    else if (defaultOffering.monthly) setSelectedPlan('monthly');
    else if (defaultOffering.weekly) setSelectedPlan('weekly');
  }, [defaultOffering]);

  const getPackageForPlan = (plan: 'weekly' | 'monthly' | 'yearly'): PurchasesPackage | null => {
    if (!defaultOffering) return null;
    if (plan === 'weekly') return defaultOffering.weekly ?? null;
    if (plan === 'monthly') return defaultOffering.monthly ?? null;
    return defaultOffering.annual ?? null;
  };

  const getPriceForPlan = (plan: 'weekly' | 'monthly' | 'yearly'): string => {
    const pkg = getPackageForPlan(plan);
    return pkg?.product?.priceString ?? '—';
  };

 



  const planFromProductIdentifier = (
    customerInfo: CustomerInfo,
    offering: PurchasesOffering | null
  ): 'weekly' | 'monthly' | 'yearly' | null => {
    if (!offering) return null;
    const productIds = Object.values(customerInfo.entitlements.active).map(
      (e) => e.productIdentifier
    );
    for (const id of productIds) {
      if (offering.weekly?.product.identifier === id) return 'weekly';
      if (offering.monthly?.product.identifier === id) return 'monthly';
      if (offering.annual?.product.identifier === id) return 'yearly';
    }
    return null;
  };

  useEffect(() => {
    AsyncStorage.setItem('elitebet_haptics', haptics.toString());
  }, [haptics]);

  useEffect(() => {
    AsyncStorage.setItem('elitebet_notifications', notifications.toString());
  }, [notifications]);

  /** Persist RevenueCat subscription success to AsyncStorage (single source of truth). */
  const persistSubscriptionSuccess = async (
    plan: 'weekly' | 'monthly' | 'yearly'
  ): Promise<void> => {
    try {
      await Promise.all([
        AsyncStorage.setItem('elitebet_pro_active', 'true'),
        AsyncStorage.setItem('elitebet_current_plan', plan),
        AsyncStorage.setItem('elitebet_subscription_success_at', Date.now().toString()),
      ]);
    } catch (error) {
      console.error('Failed to persist subscription to AsyncStorage:', error);
      throw error;
    }
  };

  const handleSubscribe = async () => {
    const pkg = getPackageForPlan(selectedPlan);
    if (!pkg) {
      triggerHaptic('error');
      return;
    }
    setIsVerifyingSubscription(true);
    triggerHaptic('medium');
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const planFromProduct = planFromProductIdentifier(customerInfo, defaultOffering);
      const plan = planFromProduct ?? selectedPlan;

      await persistSubscriptionSuccess(plan);
      setCurrentPlan(plan);
      triggerHaptic('success');
      setIsVerifyingSubscription(false);
      setIsPaywallOpen(false);
      onSubscriptionSuccess?.();
    } catch (error: unknown) {
      const err = error as { userCancelled?: boolean };
      if (err?.userCancelled) {
        // User closed the sheet, no error feedback
      } else {
        console.error('RevenueCat purchase failed:', error);
        triggerHaptic('error');
      }
      setIsVerifyingSubscription(false);
    }
  };

  const getButtonText = () => {
    if (isVerifyingSubscription) return '...';
    if (!currentPlan) return 'Get EliteBet Premium';
    if (selectedPlan === currentPlan) return 'Active Plan';

    if (PLAN_RANKS[selectedPlan] > PLAN_RANKS[currentPlan]) {
      return `Upgrade to ${selectedPlan.toUpperCase()}`;
    }
    return `Downgrade to ${selectedPlan.toUpperCase()}`;
  };

 

  const handleRestorePurchases = async () => {
    triggerHaptic('medium');
    setIsRestoring(true);
    setRestoreStatus('idle');

    try {
      const customerInfo = await Purchases.restorePurchases();
      const hasActiveEntitlement = Object.keys(customerInfo.entitlements.active).length > 0;
      if (hasActiveEntitlement) {
        const plan = planFromProductIdentifier(customerInfo, defaultOffering) ?? 'yearly';
        await persistSubscriptionSuccess(plan);
        setCurrentPlan(plan);
        setRestoreStatus('success');
        triggerHaptic('success');
      } else {
        setRestoreStatus('none');
        triggerHaptic('warning');
      }
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      setRestoreStatus('none');
      triggerHaptic('error');
    } finally {
      setTimeout(() => setIsRestoring(false), 1500);
    }
  };

  const handleOpenLegal = (type: 'terms' | 'privacy') => {
    setLegalType(type);
    setIsLegalModalOpen(true);
  };

  // Memoize benefits list to prevent re-renders
  const benefitsList = useMemo(() => {
    return [
      t('benefit1'),
      t('benefit2'),
      t('benefit3'),
      t('benefit4'),
      t('benefit5'),
      '95%+ Neural Path Accuracy',
      'Advanced AI Vision Modal Processing',
      'Real-time Momentum Power Analytics',
      'Exclusive X-Factor Prediction Logic',
      'Unlimited Tactical Matrix Access',
    ];
  }, [t]);

  // SVG Icon Components
  const CheckIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </Svg>
  );

  const ChevronRightIcon = ({
    size = 16,
    color = 'currentColor',
  }: {
    size?: number;
    color?: string;
  }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </Svg>
  );

  const CloseIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </Svg>
  );

  const SettingToggle = ({
    label,
    icon,
    value,
    onChange,
    description,
  }: {
    label: string;
    icon: React.ReactNode;
    value: boolean;
    onChange: (val: boolean) => void;
    description?: string;
  }) => (
    <View className="flex-row items-center justify-between py-3">
      <View className="flex-row items-center gap-3">
        <View className="w-8 h-8 rounded-lg bg-glass-100 flex items-center justify-center border border-white/5">
          {icon}
        </View>
        <View>
          <Text className="text-[14px] font-semibold text-white leading-tight">{label}</Text>
          {description && (
            <Text className="text-[10px] text-white/30 font-medium mt-1 leading-tight">
              {description}
            </Text>
          )}
        </View>
      </View>
      <Pressable
        onPress={() => {
          onChange(!value);
        }}
        className={`w-11 h-6 rounded-full p-1 ${value ? 'bg-blue-600' : 'bg-white/10'}`}
      >
        <View
          className="w-4 h-4 rounded-full bg-white shadow-sm"
          style={{
            transform: [{ translateX: value ? 20 : 0 }],
          }}
        />
      </Pressable>
    </View>
  );

  const SettingRow = ({
    label,
    icon,
    value,
    onPress,
    description,
    isPremium,
    accessory,
    isDestructive,
  }: {
    label: string;
    icon: React.ReactNode;
    value?: string;
    onPress: () => void;
    description?: string;
    isPremium?: boolean;
    accessory?: React.ReactNode;
    isDestructive?: boolean;
  }) => (
    <Pressable
      onPress={() => {
        triggerHaptic(isDestructive ? 'warning' : 'selection');
        onPress();
      }}
      className="flex-row items-center justify-between py-3"
      style={{ opacity: 1 }}
    >
      <View className="flex-row items-center gap-3 pr-2">
        <View
          className={`w-8 h-8 rounded-lg bg-glass-100 flex items-center justify-center border border-white/5 ${
            isDestructive ? 'text-red-500' : isPremium ? 'text-amber-400' : 'text-blue-500'
          }`}
          style={{ flexShrink: 0 }}
        >
          {icon}
        </View>
        <View>
          <View className="flex-row items-center gap-2">
            <Text
              className={`text-[14px] font-semibold leading-tight ${
                isDestructive ? 'text-red-500' : 'text-white'
              }`}
            >
              {label}
            </Text>
            {isPremium && (
              <View className="bg-amber-400/20 px-1 py-0.5 rounded">
                <Text className="text-amber-400 text-[8px] font-black uppercase tracking-tighter">
                  Pro
                </Text>
              </View>
            )}
          </View>
          {description && (
            <Text className="text-[10px] text-white/30 font-medium mt-1 leading-tight">
              {description}
            </Text>
          )}
        </View>
      </View>
      <View className="flex-row items-center gap-2" style={{ flexShrink: 0 }}>
        {value && <Text className="text-[13px] text-white/40 font-medium">{value}</Text>}
        {accessory || <ChevronRightIcon size={16} color="rgba(255, 255, 255, 0.2)" />}
      </View>
    </Pressable>
  );

  return (
    <ScrollView className="flex-1 pb-32" showsVerticalScrollIndicator={false}>
      <View className="px-0">
        <View className="mb-8 px-0">
          <Text className="text-[34px] font-bold tracking-tight text-white leading-tight">
            {t('settings')}
          </Text>
          <Text className="text-[#8e8e93] text-[15px] font-medium tracking-tight mt-1">
            {t('appPreferences')}
          </Text>
        </View>

        <View className="mb-8">
          <Text className="text-[10px] font-bold text-white/30 uppercase tracking-[0.1em] mb-3 px-0">
            {t('intelSubscription')}
          </Text>
          <View className="bg-glass-100 rounded-[24px] px-5 py-2 border border-white/5 shadow-sm">
            {currentPlan ? (
              <SettingRow
                label={t('masterPlan')}
                icon={
                  <Svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <Path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-1.006 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946 1.006 3.42 3.42 0 013.138 3.138 3.42 3.42 0 001.006 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-1.006 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946 1.006 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-1.006 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-1.006-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 001.006-1.946 3.42 3.42 0 013.138-3.138z"
                    />
                  </Svg>
                }
                description={currentPlan ? `${currentPlan.toUpperCase()} ACCESS` : t('activeSubscription')}
                isPremium
                onPress={() => {
                  if (currentPlan) setSelectedPlan(currentPlan);
                  setIsPaywallOpen(true);
                }}
              />
            ) : (
              <SettingRow
                label={t('intelSubscription')}
                icon={
                  <Svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <Path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </Svg>
                }
                description={t('unlockPro')}
                onPress={() => setIsPaywallOpen(true)}
                accessory={
                  <View className="bg-blue-600 px-3.5 py-1.5 rounded-full shadow-lg shadow-blue-500/20">
                    <Text className="text-[10px] font-black text-white uppercase tracking-tighter">
                      Upgrade
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-[10px] font-bold text-white/30 uppercase tracking-[0.1em] mb-3 px-0">
            {t('preferences')}
          </Text>
          <View className="bg-glass-100 rounded-[24px] px-5 py-2 border border-white/5">
            <View className="border-b border-white/5">
              <SettingRow
                label={t('language')}
                icon={
                  <Svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <Path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </Svg>
                }
                value={LANGUAGES.find((l) => l.code === language)?.name || 'English'}
                onPress={() => setIsLanguageModalOpen(true)}
              />
            </View>
            <SettingRow
              label={t('restorePurchases')}
              icon={
                <Svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <Path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </Svg>
              }
              onPress={handleRestorePurchases}
            />
          </View>
        </View>

      
        <View className="mb-6">
          <Text className="text-[10px] font-bold text-white/30 uppercase tracking-[0.1em] mb-3 px-4">
            {t('support')}
          </Text>
          <View className="bg-glass-100 rounded-[24px] px-5 py-2 border border-white/5">
            <View className="border-b border-white/5">
              <SettingRow
                label={t('termsOfService')}
                icon={
                  <Svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <Path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </Svg>
                }
                onPress={() => handleOpenLegal('terms')}
              />
            </View>
            <View className="border-b border-white/5">
              <SettingRow
                label={t('privacyPolicy')}
                icon={
                  <Svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <Path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </Svg>
                }
                onPress={() => handleOpenLegal('privacy')}
              />
            </View>
            
          </View>
        </View>
      </View>


      {/* Language Modal */}
      <Modal
        visible={isLanguageModalOpen}
        animationType="fade"
        onRequestClose={() => {
          triggerHaptic('light');
          setIsLanguageModalOpen(false);
        }}
      >
        <View className="flex-1 bg-[#0a0a0c]">
          <Pressable
            className="flex-1 items-center justify-center px-6"
            onPress={() => {
              triggerHaptic('light');
              setIsLanguageModalOpen(false);
            }}
          >
            <Pressable
              className="bg-glass-100 w-full max-w-sm rounded-[32px] border border-white/10 shadow-2xl p-6"
              onPress={(e) => e.stopPropagation()}
            >
              <View className="absolute top-5 right-5 z-10">
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('light');
                    setIsLanguageModalOpen(false);
                  }}
                  className="w-8 h-8 rounded-full bg-glass-100 flex items-center justify-center border border-white/10"
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <CloseIcon size={16} color="rgba(255, 255, 255, 0.6)" />
                </TouchableOpacity>
              </View>
              <Text className="text-[17px] font-bold text-white mb-6 text-center">
                {t('chooseLanguage')}
              </Text>
              <ScrollView className="max-h-[45vh] mb-6" showsVerticalScrollIndicator={false}>
                <View className="gap-2">
                  {LANGUAGES.map((lang) => (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={() => {
                        triggerHaptic('selection');
                        setLanguage(lang.code);
                        setIsLanguageModalOpen(false);
                      }}
                      className={`w-full py-4 px-5 rounded-[18px] flex-row justify-between items-center ${
                        language === lang.code ? 'bg-blue-600' : 'bg-white/5'
                      }`}
                      activeOpacity={0.7}
                    >
                      <Text
                        className={`font-semibold ${language === lang.code ? 'text-white' : 'text-white/70'}`}
                      >
                        {lang.name}
                      </Text>
                      {language === lang.code && <CheckIcon size={20} color="white" />}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      {/* Legal Modal */}
      <Modal
        visible={isLegalModalOpen}
        animationType="slide"
        onRequestClose={() => setIsLegalModalOpen(false)}
      >
        <View className="flex-1 bg-[#0a0a0c]">
          <View
            className="px-6 pt-12 pb-6 flex-row justify-between items-center border-b border-white/5"
            style={{ paddingTop: insets.top + 48 }}
          >
            <Text className="text-[20px] font-bold text-white">
              {legalType === 'terms' ? t('termsOfService') : t('privacyPolicy')}
            </Text>
            <TouchableOpacity
              onPress={() => setIsLegalModalOpen(false)}
              className="w-9 h-9 rounded-full bg-glass-100 flex items-center justify-center border border-white/10"
              activeOpacity={0.7}
            >
              <CloseIcon size={20} color="rgba(255, 255, 255, 0.6)" />
            </TouchableOpacity>
          </View>
          <ScrollView className="flex-1 px-6 py-8" showsVerticalScrollIndicator={false}>
            <View className="gap-6">
              {legalType === 'terms' ? (
                <>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">1. Agreement to Terms</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      By accessing or using the EliteBet AI mobile application, you represent that
                      you have read, understood, and agree to be bound by these Terms of Service.
                      If you do not agree with any of these terms, you are expressly prohibited
                      from using the application and must discontinue use immediately.
                    </Text>
                  </View>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">2. Nature of Service</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      EliteBet AI provides advanced predictive analytics for sporting events using
                      state-of-the-art AI models. These insights are provided for{' '}
                      <Text className="font-bold">informational and entertainment purposes only</Text>.
                      We do not facilitate gambling, and we do not act as a bookmaker or betting
                      operator.
                    </Text>
                    <View className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl">
                      <Text className="text-blue-400 font-bold italic text-[13px]">
                        DISCLAIMER: Past performance is not indicative of future results. Sports
                        betting involves risk. Use AI insights as one of many tools in your
                        decision-making process.
                      </Text>
                    </View>
                  </View>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">3. Intellectual Property</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      The "EliteBet AI" name, logo, proprietary algorithms, neural synthesis engines,
                      and all content provided within the app are the exclusive property of the
                      developers and are protected by international copyright laws.
                    </Text>
                  </View>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">4. User Responsibility</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      Users are responsible for ensuring their usage of the app complies with all
                      local, state, and federal laws regarding sports analysis and information. We
                      assume no liability for any losses incurred through betting activities.
                    </Text>
                  </View>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">5. Subscription Terms</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      Premium access is billed on a recurring basis. You may cancel at any time
                      through your device's subscription management settings. No refunds are
                      provided for partially used billing periods.
                    </Text>
                  </View>
                  <View className="pt-8 opacity-40">
                    <Text className="text-[12px] text-center italic text-white/60">
                      Last Updated: October 2026 • EliteBet AI Legal Team
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">1. Data We Collect</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      EliteBet AI follows a "Privacy First" architecture. We do not require account
                      creation for basic features. We collect minimal device metadata and preference
                      data (language, haptic settings) stored locally on your device to personalize
                      your experience.
                    </Text>
                  </View>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">2. Camera & Vision Processing</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      When you use "AI Vision Mode," your camera stream is processed locally or
                      ephemerally via secure AI endpoints. We do not store your photos on our
                      servers. Images are used solely to identify teams and fixtures for real-time
                      analysis.
                    </Text>
                  </View>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">3. Third-Party AI Models</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      We leverage Google Gemini AI for advanced tactical synthesis. Data sent for
                      processing (team names, match context) is stripped of personally identifiable
                      information. Your privacy is protected by end-to-end encryption during data
                      transit.
                    </Text>
                  </View>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">4. Local Storage Security</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      Your "Saved Insights" and "Tracked Performance" are stored in your device's
                      secure Local Storage enclave. Clearing your cache or uninstalling the app
                      will permanently delete this data.
                    </Text>
                  </View>
                  <View className="gap-3">
                    <Text className="text-white font-bold text-[18px]">5. Push Notifications</Text>
                    <Text className="text-white/60 text-[14px] leading-relaxed">
                      If you opt-in, we send real-time alerts for high-confidence signals. You can
                      manage these permissions at any time through your system settings.
                    </Text>
                  </View>
                  <View className="pt-8 opacity-40">
                    <Text className="text-[12px] text-center italic text-white/60">
                      Privacy Policy Version: 1.5 • EliteBet AI Data Protection
                    </Text>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
          <View
            className="px-6 py-6 bg-glass-100 border-t border-white/5"
            style={{ paddingBottom: insets.bottom + 24 }}
          >
            <TouchableOpacity
              onPress={() => setIsLegalModalOpen(false)}
              className="w-full h-14 rounded-[20px] bg-white"
              activeOpacity={0.8}
            >
              <Text className="text-black font-bold text-[15px] text-center leading-[56px]">
                {t('done')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Paywall Modal */}
      <Modal
        visible={isPaywallOpen}
        animationType="slide"
        onRequestClose={() => setIsPaywallOpen(false)}
        statusBarTranslucent
      >
        <View className="flex-1 bg-[#0a0a0c]">
          <View
            className="absolute top-0 w-full flex-row justify-end px-6 py-4 z-[200]"
            style={{ paddingTop: insets.top + 16 }}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={() => {
                triggerHaptic('light');
                setIsPaywallOpen(false);
              }}
              className="w-10 h-10 rounded-full bg-glass-100 flex items-center justify-center border border-white/10 shadow-xl"
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <CloseIcon size={20} color="rgba(255, 255, 255, 0.8)" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            className="flex-1" 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
          >
            <View className="relative flex-col items-center px-6 pt-16 pb-40 text-center">
              {/* <View
                className="absolute top-0 w-full h-[400px] rounded-full opacity-50"
                style={{
                  backgroundColor: 'rgba(37, 99, 235, 0.2)',
                  left: '50%',
                  marginLeft: -200,
                  transform: [{ translateY: -80 }],
                }}
              /> */}

              {/* <View className="w-16 h-16 rounded-[22px] bg-blue-600 flex items-center justify-center shadow-2xl mb-6 relative">
                <View className="absolute inset-0 bg-blue-500/10 rounded-full opacity-50" />
                <Svg
                  width={32}
                  height={32}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth={3}
                >
                  <Path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </Svg>
              </View> */}

              <Text className="text-[28px] font-black text-white mb-2 tracking-tight leading-tight">
                EliteBet <Text className="text-blue-500">Premium</Text>
              </Text>
              <Text className="text-white/50 text-[14px] mb-8 font-medium leading-relaxed max-w-[280px]">
                {currentPlan ? `Current Plan: ${currentPlan.toUpperCase()}` : t('unlockPro')}
              </Text>

              <View className="w-full gap-3 mb-8 max-w-[400px]">
                {/* Weekly: name, duration, total billed (Apple 3.1.2) */}
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedPlan('weekly');
                  }}
                  className={`w-full p-4 rounded-[22px] border relative ${
                    selectedPlan === 'weekly'
                      ? 'bg-white/5 border-blue-500'
                      : 'bg-transparent border-white/10'
                  }`}
                  activeOpacity={0.7}
                  style={{
                    borderWidth: selectedPlan === 'weekly' ? 2 : 1,
                    borderColor: selectedPlan === 'weekly' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <View className="flex-row justify-between items-center w-full">
                    <View className="flex-col items-start flex-1">
                      <Text className="text-[24px] font-extrabold text-white leading-tight">
                        {getPriceForPlan('weekly')} /week
                      </Text>
                      <Text className="text-[13px] font-semibold text-white/90 mt-1">
                         Billed weekly,cancel anytime 
                        </Text>
                      {currentPlan === 'weekly' && (
                        <Text className="text-[9px] text-blue-500 font-bold uppercase mt-1">Current</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Monthly: name, duration, price (Apple 3.1.2) */}
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedPlan('monthly');
                  }}
                  className={`w-full p-4 rounded-[22px] border relative ${
                    selectedPlan === 'monthly'
                      ? 'bg-white/5 border-blue-500'
                      : 'bg-transparent border-white/10'
                  }`}
                  activeOpacity={0.7}
                  style={{
                    borderWidth: selectedPlan === 'monthly' ? 2 : 1,
                    borderColor: selectedPlan === 'monthly' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <View className="flex-row justify-between items-center w-full">
                    <View className="flex-col items-start flex-1">
                     
                      <Text className="text-[24px] font-extrabold text-white leading-tight">
                        {getPriceForPlan('monthly')} /month
                      </Text>
                     
                        <Text className="text-[13px] font-semibold text-white/90 mt-1">
                         Billed monthly, cancel anytime 
                        </Text>
                      
                      {currentPlan === 'monthly' && (
                        <Text className="text-[9px] text-blue-500 font-bold uppercase mt-1">Current</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Yearly: name, duration, total billed most prominent (Apple 3.1.2) */}
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedPlan('yearly');
                  }}
                  className={`w-full p-4 rounded-[22px] border relative ${
                    selectedPlan === 'yearly'
                      ? 'bg-white/5 border-blue-500'
                      : 'bg-transparent border-white/10'
                  }`}
                  activeOpacity={0.7}
                  style={{
                    borderWidth: selectedPlan === 'yearly' ? 2 : 1,
                    borderColor: selectedPlan === 'yearly' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                 
                  <View className="flex-row justify-between items-center w-full">
                    <View className="flex-col items-start flex-1">
                      
                      <Text className="text-[24px] font-extrabold text-white leading-tight">
                        {getPriceForPlan('yearly')} /year
                      </Text>
                     
                        <Text className="text-[13px] font-semibold text-white/90 mt-1">
                         Billed yearly,save save 40%
                        </Text>
                   
                     
                    </View>
                  
                  </View>
                </TouchableOpacity>
              </View>

              <View className="w-full flex-col gap-4 mb-10 px-2 max-w-[320px]">
                {benefitsList.map((benefit, i) => (
                  <View key={`benefit-${i}-${benefit}`} className="flex-row items-center gap-4">
                    <View 
                      className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20"
                      style={{ width: 24, height: 24 }}
                    >
                      <CheckIcon size={14} color="#3b82f6" />
                    </View>
                    <Text className="text-[13px] font-bold text-white/80 tracking-tight leading-tight">
                      {benefit}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View
            className="absolute bottom-0 left-0 right-0 px-6 pt-6 bg-[#0a0a0c] z-[130] items-center"
            style={{ paddingBottom: insets.bottom + 20 }}
          >
            {/* Terms of Use (EULA) and Privacy Policy - required on same screen as Buy (Apple 3.1.2) */}
           
            {/* Subscribe button: Pressable with min 44pt touch target for iPad (Apple 2.1) */}
            <Pressable
              onPress={handleSubscribe}
              disabled={
                isVerifyingSubscription ||
                offeringsLoading ||
                selectedPlan === currentPlan ||
                !getPackageForPlan(selectedPlan)
              }
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ minWidth: 280, minHeight: 56, maxWidth: 400 }}
              className={`w-full max-w-[400px] rounded-[24px] font-black text-[16px] shadow-2xl flex-row items-center justify-center ${
                selectedPlan === currentPlan || !getPackageForPlan(selectedPlan) || offeringsLoading
                  ? 'bg-white/10 opacity-50'
                  : 'bg-blue-600 shadow-blue-600/30'
              }`}
            >
              <Text
                className={`font-black text-[16px] ${
                  selectedPlan === currentPlan || !getPackageForPlan(selectedPlan) || offeringsLoading ? 'text-white/40' : 'text-white'
                }`}
              >
                {offeringsLoading ? 'Loading...' : getButtonText()}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Restore Purchases Modal */}
      <Modal
        visible={isRestoring}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRestoring(false)}
      >
        <View
          className="flex-1 items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <View className="bg-glass-100 rounded-[32px] p-8 border border-white/10 max-w-[280px]">
            {restoreStatus === 'idle' && (
              <View className="flex-col items-center">
                <ActivityIndicator size="large" color="#3b82f6" className="mb-4" />
                <Text className="text-[17px] font-bold text-white">Restoring...</Text>
              </View>
            )}
            {restoreStatus === 'success' && (
              <View className="flex-col items-center">
                <View className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mb-4">
                  <CheckIcon size={24} color="white" />
                </View>
                <Text className="text-[17px] font-bold text-white">Success</Text>
              </View>
            )}
            {restoreStatus === 'none' && (
              <View className="flex-col items-center">
                <Text className="text-[17px] font-bold text-white">No purchases found</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default SettingsView;

