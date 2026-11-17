export interface SmsSendResult {
  success: boolean;
  provider: string;
  messageId?: string | null;
  error?: string;
}

export interface SmsAdapter {
  readonly name: string;
  isConfigured(): boolean;
  send(toPhone: string, body: string): Promise<SmsSendResult>;
}
