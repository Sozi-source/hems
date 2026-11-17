import { AfricasTalkingAdapter } from './africas-talking';
import { MobiwavesAdapter } from './mobiwaves';
import { SmsAdapter } from './types';

/**
 * Returns the active SMS adapter for loan reminders.
 * Defaults to Mobiwaves (the production HEMS SMS provider);
 * switches to Africa's Talking only when LOAN_SMS_PROVIDER=africas_talking.
 */
export function getLoanSmsAdapter(): SmsAdapter {
  if (process.env.LOAN_SMS_PROVIDER === 'africas_talking') {
    return new AfricasTalkingAdapter();
  }
  return new MobiwavesAdapter();
}

export type { SmsAdapter, SmsSendResult } from './types';
