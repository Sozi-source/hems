export type SmsBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface SmsStatusView {
  label: string;
  variant: SmsBadgeVariant;
  /** Short explanation shown under the badge, when there is something useful to say. */
  note: string | null;
}

const BLOCK_ERRORS = ['userinblacklist', 'blacklisted', 'optedout', 'userisinactive'];

function isBlockError(error: string | null | undefined) {
  const value = (error || '').toLowerCase();
  return BLOCK_ERRORS.some((code) => value.includes(code)) || value.includes('recipient blocked');
}

/** Maps an sms_outbox row to a label, colour and explanation for the Reminders page. */
export function describeSmsStatus(status: string, error?: string | null): SmsStatusView {
  const blocked = isBlockError(error);

  switch (status) {
    case 'delivered':
      return { label: 'Delivered', variant: 'success', note: null };
    case 'sent':
      return { label: 'Sent', variant: 'info', note: null };
    case 'queued':
    case 'sending':
      return { label: status === 'queued' ? 'Queued' : 'Sending', variant: 'neutral', note: null };
    case 'failed':
      return blocked
        ? { label: 'SMS blocked', variant: 'danger', note: 'The SMS provider refuses to deliver to this number.' }
        : { label: 'Failed', variant: 'danger', note: error ? String(error).slice(0, 120) : null };
    case 'undelivered':
      return { label: 'Not delivered', variant: 'danger', note: error ? String(error).slice(0, 120) : null };
    case 'cancelled':
      return blocked
        ? { label: 'Skipped (blocked)', variant: 'warning', note: 'Not sent because this customer is SMS blocked.' }
        : { label: 'Cancelled', variant: 'neutral', note: null };
    default:
      return { label: status, variant: 'neutral', note: null };
  }
}
