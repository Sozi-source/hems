'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Business, BusinessCode } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface BusinessContextType {
  activeBusinessCode: BusinessCode;
  activeBusiness: Business | null;
  activeBusinessId: string | null;
  businesses: Business[];
  isMasterView: boolean;
  setBusiness: (code: BusinessCode) => void;
  isLoading: boolean;
}

const DEFAULT_BUSINESSES: Business[] = [
  {
    id: '',
    code: 'HARON_FASHION',
    name: 'Haron Fashion',
    legal_name: null,
  },
  {
    id: '',
    code: 'ZENITH_PLAST',
    name: 'Zenith Plast Distributors Ltd',
    legal_name: 'Zenith Plast Distributors Ltd',
  },
];

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>(DEFAULT_BUSINESSES);
  const [activeCode, setActiveCode] = useState<BusinessCode>('MASTER');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Restore saved choice
    const saved = localStorage.getItem('hems_active_business') as BusinessCode | null;
    if (saved && (saved === 'HARON_FASHION' || saved === 'ZENITH_PLAST' || saved === 'MASTER')) {
      setActiveCode(saved);
    }

    // 2. Fetch real businesses from API / Supabase
    async function fetchRealBusinesses() {
      try {
        const res = await fetch('/api/businesses');
        if (res.ok) {
          const json = await res.json();
          if (json.businesses && json.businesses.length > 0) {
            setBusinesses(json.businesses as Business[]);
            return;
          }
        }

        const supabase = createClient();
        const { data } = await supabase
          .from('businesses')
          .select('id, code, name, legal_name')
          .order('name');

        if (data && data.length > 0) {
          setBusinesses(data as Business[]);
        }
      } catch {
        // Keeps clean defaults if offline
      } finally {
        setIsLoading(false);
      }
    }

    fetchRealBusinesses();
  }, []);

  const setBusiness = (code: BusinessCode) => {
    setActiveCode(code);
    localStorage.setItem('hems_active_business', code);
    document.cookie = `hems_active_business=${code}; path=/; max-age=31536000; SameSite=Lax`;
  };

  const isMasterView = activeCode === 'MASTER';
  const activeBusiness = isMasterView
    ? null
    : businesses.find((b) => b.code === activeCode) || null;
  const activeBusinessId = activeBusiness?.id || null;

  return (
    <BusinessContext.Provider
      value={{
        activeBusinessCode: activeCode,
        activeBusiness,
        activeBusinessId,
        businesses,
        isMasterView,
        setBusiness,
        isLoading,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}
