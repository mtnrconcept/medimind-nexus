import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Calculator, ShieldCheck } from 'lucide-react';
import SwitchCalculator from './SwitchCalculator';
import InteractionChecker from './InteractionChecker';
import { useAutoTranslation } from '@/contexts/TranslationContext';

const TreatmentTools = () => {
    const { t } = useAutoTranslation();

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('Outils Cliniques')}</h2>
                <p className="text-slate-500 dark:text-slate-400">
                    {t('Calculateurs de conversion et analyse de sécurité pour optimiser vos prescriptions.')}
                </p>
            </div>

            <Tabs defaultValue="switch" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="switch" className="gap-2">
                        <Calculator className="h-4 w-4" />
                        {t('Calculateur de Switch')}
                    </TabsTrigger>
                    <TabsTrigger value="interactions" className="gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        {t('Interactions')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="switch" className="mt-0">
                    <div className="h-[600px]">
                        <SwitchCalculator />
                    </div>
                </TabsContent>

                <TabsContent value="interactions" className="mt-0">
                    <div className="h-[600px]">
                        <InteractionChecker />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default TreatmentTools;
