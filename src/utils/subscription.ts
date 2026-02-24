import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';

export type PlanType = 'weekly' | 'monthly' | 'yearly';

/** Infer plan from RevenueCat product identifier (rc_weekly, rc_monthly, rc_yearly) */
function planFromProductId(productId: string): PlanType {
  const id = productId.toLowerCase();
  if (id.includes('weekly')) return 'weekly';
  if (id.includes('monthly')) return 'monthly';
  return 'yearly'; // yearly, annual, or default
}

/** Sync subscription status from RevenueCat to AsyncStorage. Call on app launch and when CustomerInfo updates. */
export async function syncSubscriptionFromRevenueCat(): Promise<{
  isPro: boolean;
  plan: PlanType | null;
}> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const hasActive = Object.keys(customerInfo.entitlements.active).length > 0;

    if (!hasActive) {
      await Promise.all([
        AsyncStorage.removeItem('elitebet_pro_active'),
        AsyncStorage.removeItem('elitebet_current_plan'),
        AsyncStorage.removeItem('elitebet_subscription_success_at'),
      ]);
      return { isPro: false, plan: null };
    }

    const productIds = Object.values(customerInfo.entitlements.active).map(
      (e) => e.productIdentifier
    );
    const plan = planFromProductId(productIds[0] ?? 'rc_yearly');

    await Promise.all([
      AsyncStorage.setItem('elitebet_pro_active', 'true'),
      AsyncStorage.setItem('elitebet_current_plan', plan),
      AsyncStorage.setItem('elitebet_subscription_success_at', Date.now().toString()),
    ]);

    return { isPro: true, plan };
  } catch (error) {
    console.warn('[Subscription] Failed to sync from RevenueCat:', error);
    return { isPro: false, plan: null };
  }
}
