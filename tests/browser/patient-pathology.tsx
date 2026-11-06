import React, { useState, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PatientPathologySimilarity } from '@/components/patient/PatientPathologySimilarity';
import { supabase } from '@/integrations/supabase/client';
import '@/index.css';

type SimilarityProps = ComponentProps<typeof PatientPathologySimilarity>;
interface Sources {
  pathologies: SimilarityProps['primaryPathology'];
  patient_pathologies: SimilarityProps['recordedPathologies'];
  patient_medical_history: SimilarityProps['medicalHistory'];
}
declare global { interface Window { __pathologySeed: { patientId: string; userId: string; sources: Sources } } }
const seed = window.__pathologySeed;
const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: seed.userId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.synthetic-signature`;
await supabase.auth.setSession({ access_token: token, refresh_token: 'synthetic-refresh-token' });

export function Harness() {
  const [sources, setSources] = useState(seed.sources);
  const refresh = async () => {
    const { data, error } = await supabase.from('patients')
      .select('pathologies(id,name,icd_code,category),patient_pathologies(*,pathologies(*)),patient_medical_history(*)')
      .eq('id', seed.patientId).maybeSingle();
    if (error || !data) throw new Error('refresh unavailable');
    setSources(data);
  };
  return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><main className="mx-auto max-w-5xl p-4">
    <PatientPathologySimilarity patientId={seed.patientId} primaryPathology={sources.pathologies}
      recordedPathologies={sources.patient_pathologies} medicalHistory={sources.patient_medical_history} onRefresh={refresh} />
  </main></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
