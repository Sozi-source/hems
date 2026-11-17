export interface InstalmentForAllocation {
  id: string;
  instalment_no: number;
  interest_minor: number;
  principal_minor: number;
  paid_interest_minor: number;
  paid_principal_minor: number;
}

export interface AllocationStep {
  instalment_id: string;
  instalment_no: number;
  interest_minor: number;
  principal_minor: number;
  resulting_status: 'paid' | 'partial';
}

export interface PaymentAllocationResult {
  allocations: AllocationStep[];
  total_interest_minor: number;
  total_principal_minor: number;
  overpayment_to_principal_minor: number;
}

/**
 * Pure payment allocation preview/test helper:
 * Splits an incoming payment chronologically across unpaid instalments (interest first, then principal).
 * Any excess above scheduled instalments is applied to principal.
 */
export function allocateLoanPayment(
  instalments: InstalmentForAllocation[],
  amountMinor: number
): PaymentAllocationResult {
  if (amountMinor <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  let remaining = Math.round(amountMinor);
  let totalInterest = 0;
  let totalPrincipal = 0;
  const allocations: AllocationStep[] = [];

  const sorted = [...instalments].sort((a, b) => a.instalment_no - b.instalment_no);

  for (const inst of sorted) {
    if (remaining <= 0) break;

    const remInt = Math.max(0, inst.interest_minor - inst.paid_interest_minor);
    const remPrin = Math.max(0, inst.principal_minor - inst.paid_principal_minor);

    if (remInt === 0 && remPrin === 0) continue;

    const payInt = Math.min(remaining, remInt);
    remaining -= payInt;

    const payPrin = Math.min(remaining, remPrin);
    remaining -= payPrin;

    totalInterest += payInt;
    totalPrincipal += payPrin;

    const fullyCovered =
      inst.paid_interest_minor + payInt >= inst.interest_minor &&
      inst.paid_principal_minor + payPrin >= inst.principal_minor;

    allocations.push({
      instalment_id: inst.id,
      instalment_no: inst.instalment_no,
      interest_minor: payInt,
      principal_minor: payPrin,
      resulting_status: fullyCovered ? 'paid' : 'partial',
    });
  }

  const overpaymentToPrincipal = remaining > 0 ? remaining : 0;
  totalPrincipal += overpaymentToPrincipal;

  return {
    allocations,
    total_interest_minor: totalInterest,
    total_principal_minor: totalPrincipal,
    overpayment_to_principal_minor: overpaymentToPrincipal,
  };
}
