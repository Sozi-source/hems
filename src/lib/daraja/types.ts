export interface DarajaC2BPayload {
  TransactionType: string;
  TransID: string;
  TransTime: string;
  TransAmount: string;
  BusinessShortCode: string;
  BillRefNumber: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string;
  ThirdPartyTransID?: string;
  MSISDN: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

export interface DarajaStkCallbackMetadataItem {
  Name: string;
  Value?: string | number;
}

export interface DarajaStkCallbackPayload {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: DarajaStkCallbackMetadataItem[];
      };
    };
  };
}

export interface DarajaConfig {
  environment: 'sandbox' | 'production';
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  callbackUrl?: string;
}

export interface StkInitiateParams {
  businessId: string;
  customerId: string;
  channelId?: string;
  phone: string;
  amountMinor: number | bigint;
  accountReference: string;
  description?: string;
}
