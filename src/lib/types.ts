export type BusinessCode = 'HARON_FASHION' | 'ZENITH_PLAST' | 'MASTER';

export type UserRole = 'owner' | 'admin' | 'accountant' | 'cashier' | 'viewer';

export interface Business {
  id: string;
  code: string;
  name: string;
  legal_name: string | null;
  created_at?: string;
}

export type ObligationKind =
  | 'customer_debt'
  | 'supplier_payable'
  | 'loan'
  | 'bill'
  | 'salary'
  | 'staff_advance'
  | 'tax';

export type ObligationDirection = 'receivable' | 'payable';

export type ObligationStatus =
  | 'open'
  | 'partially_paid'
  | 'paid'
  | 'written_off'
  | 'cancelled';

export interface Obligation {
  id: string;
  business_id: string;
  kind: ObligationKind;
  direction: ObligationDirection;
  party_id: string;
  party_name?: string;
  party_phone?: string;
  principal_minor: number;
  balance_minor: number;
  status: ObligationStatus;
  due_date: string;
  issue_date: string;
  reference_no: string;
  notes?: string;
  created_at: string;
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'reversed';
export type PaymentProvider = 'mpesa_c2b' | 'mpesa_stk' | 'mpesa_b2c' | 'bank' | 'cash';

export interface PaymentTransaction {
  id: string;
  business_id: string | null;
  business_name?: string;
  provider: PaymentProvider | string;
  transaction_ref: string;
  amount_minor: number;
  occurred_at: string;
  payer_msisdn?: string;
  payer_name?: string;
  account_reference?: string;
  status: PaymentStatus;
  conflict_flags?: string[];
  conflict_resolution_note?: string | null;
  allocated_minor?: number;
  unallocated_minor?: number;
  match_confidence?: number;
  decided_at?: string;
  payer_phone?: string;
  bill_ref_number?: string;
  received_at?: string;
  approved_at?: string;
}

export interface BusinessDashboardStats {
  business_id: string;
  code: string;
  name: string;
  receivables_total_minor: number;
  receivables_overdue_minor: number;
  payables_total_minor: number;
  collected_this_month_minor: number;
  pending_payments_count: number;
  pending_payments_total_minor: number;
  active_customers_count: number;
  overdue_obligations_count: number;
}

export interface MasterDashboardStats {
  total_receivables_minor: number;
  total_payables_minor: number;
  total_collected_month_minor: number;
  total_pending_approval_minor: number;
  businesses: BusinessDashboardStats[];
}
