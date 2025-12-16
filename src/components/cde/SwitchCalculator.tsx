import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, RotateCw, AlertTriangle, Calculator, Clock, Pill } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { toast } from 'sonner';

interface DrugEquivalence {
    id: string;
    category: string;
    drug_name: string;
    equivalent_dose: number;
    unit: string;
    reference_drug: string;
    reference_dose: number;
    half_life_range: string;
    notes: string;
}

const SwitchCalculator = () => {
    const { t } = useAutoTranslation();
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('benzodiazepine');
    const [drugs, setDrugs] = useState<DrugEquivalence[]>([]);

    // Form state
    const [fromDrugId, setFromDrugId] = useState<string>('');
    const [toDrugId, setToDrugId] = useState<string>('');
    const [currentDose, setCurrentDose] = useState<string>('10');
    const [result, setResult] = useState<any>(null);

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        if (selectedCategory) {
            loadDrugs(selectedCategory);
        }
    }, [selectedCategory]);

    useEffect(() => {
        calculateSwitch();
    }, [fromDrugId, toDrugId, currentDose, drugs]);

    const loadCategories = async () => {
        try {
            const { data, error } = await supabase
                .from('drug_equivalences')
                .select('category');

            if (error) throw error;

            const uniqueCategories = Array.from(new Set(data.map(d => d.category)));
            setCategories(uniqueCategories);
            if (uniqueCategories.length > 0 && !selectedCategory) {
                setSelectedCategory(uniqueCategories[0]);
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const loadDrugs = async (category: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('drug_equivalences')
                .select('*')
                .eq('category', category)
                .order('drug_name');

            if (error) throw error;
            setDrugs(data || []);

            // Reset selection when category changes
            setFromDrugId('');
            setToDrugId('');
            setResult(null);
        } catch (error) {
            console.error('Error loading drugs:', error);
            toast.error(t('Erreur lors du chargement des médicaments'));
        } finally {
            setLoading(false);
        }
    };

    const calculateSwitch = () => {
        if (!fromDrugId || !toDrugId || !currentDose) {
            setResult(null);
            return;
        }

        const fromDrug = drugs.find(d => d.id === fromDrugId);
        const toDrug = drugs.find(d => d.id === toDrugId);
        const dose = parseFloat(currentDose);

        if (!fromDrug || !toDrug || isNaN(dose)) return;

        // Formula: (CurrentDose / FromEqDose) * ToEqDose
        // All equivalents are relative to the reference drug/dose
        // e.g. Diazepam 10mg is ref. Alprazolam 0.5mg is eq to Diazepam 10mg.
        // Convert input to reference dose first:
        // RefDose = (InputDose / FromEq) * RefEq (usually RefEq is consistent 10mg)

        // Actually the table stores: equivalent_dose of THIS drug = reference_dose of REF drug
        // e.g. Alprazolam 0.5mg = Diazepam 10mg
        // So Factor = reference_dose / equivalent_dose

        // Let's normalize everything to the reference unit
        const fromFactor = fromDrug.reference_dose / fromDrug.equivalent_dose; // e.g. 10 / 0.5 = 20 (Alpraz is 20x potent)
        const toFactor = toDrug.reference_dose / toDrug.equivalent_dose; // e.g. 10 / 10 = 1 (Diazepam)

        // Normalized Ref Dose = InputDose * fromFactor
        const refDose = dose * fromFactor;

        // Target Dose = RefDose / toFactor
        const targetDose = refDose / toFactor;

        // Alternative calculation simply using ratios:
        // (Input / FromEq) * ToEq
        // (1mg Alpraz / 0.5) * 10 = 20mg Diazepam. Correct.
        const calculatedDose = (dose / fromDrug.equivalent_dose) * toDrug.equivalent_dose;

        setResult({
            dose: calculatedDose.toFixed(2),
            unit: toDrug.unit,
            ratio: (toDrug.equivalent_dose / fromDrug.equivalent_dose).toFixed(2),
            fromDrug,
            toDrug
        });
    };

    return (
        <div className="grid md:grid-cols-2 gap-6 h-full">
            <Card className="bg-white/50 dark:bg-slate-900/50">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-violet-500" />
                        {t('Paramètres du Switch')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Classe Thérapeutique')}</label>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('Choisir une classe')} />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map(cat => (
                                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-4 border border-slate-200 dark:border-slate-700">
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Pill className="h-4 w-4 text-red-500" />
                                {t('Médicament Actuel (Départ)')}
                            </label>
                            <Select value={fromDrugId} onValueChange={setFromDrugId}>
                                <SelectTrigger className="bg-white dark:bg-slate-900">
                                    <SelectValue placeholder={t('Sélectionner la molécule')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {drugs.map(drug => (
                                        <SelectItem key={drug.id} value={drug.id}>
                                            {drug.drug_name} ({drug.equivalent_dose} {drug.unit} eq.)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('Dosage Actuel')}</label>
                            <div className="flex gap-2">
                                <Input
                                    type="number"
                                    value={currentDose}
                                    onChange={e => setCurrentDose(e.target.value)}
                                    className="bg-white dark:bg-slate-900 font-mono text-lg"
                                />
                                <div className="flex items-center px-3 bg-slate-200 dark:bg-slate-700 rounded-md text-sm font-medium">
                                    {drugs.find(d => d.id === fromDrugId)?.unit || 'mg'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                            <ArrowRight className="h-5 w-5 text-slate-400 transform rotate-90 md:rotate-0" />
                        </div>
                    </div>

                    <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/20 space-y-4 border border-violet-200 dark:border-violet-800/50">
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <RotateCw className="h-4 w-4 text-violet-500" />
                                {t('Médicament Cible (Arrivée)')}
                            </label>
                            <Select value={toDrugId} onValueChange={setToDrugId}>
                                <SelectTrigger className="bg-white dark:bg-slate-900">
                                    <SelectValue placeholder={t('Sélectionner la molécule cible')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {drugs.map(drug => (
                                        <SelectItem key={drug.id} value={drug.id}>
                                            {drug.drug_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white/50 dark:bg-slate-900/50 flex flex-col">
                <CardHeader>
                    <CardTitle className="text-lg">{t('Résultat & Analyse')}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                    {result ? (
                        <div className="space-y-6 flex-1">
                            {/* Main Result */}
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg text-center">
                                <p className="text-violet-100 text-sm font-medium mb-1 uppercase tracking-wider">{t('Dose Équivalente Estimée')}</p>
                                <div className="flex items-baseline justify-center gap-2">
                                    <span className="text-5xl font-bold">{parseFloat(result.dose).toLocaleString()}</span>
                                    <span className="text-2xl opacity-80">{result.unit}</span>
                                </div>
                                <p className="mt-2 text-sm text-white/80">
                                    {result.toDrug.drug_name}
                                </p>
                            </div>

                            {/* Comparison Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800">
                                    <div className="md:flex items-center gap-2 mb-2">
                                        <Clock className="h-4 w-4 text-blue-500" />
                                        <span className="text-xs font-bold uppercase text-slate-500">{t('Demi-vie (Départ)')}</span>
                                    </div>
                                    <p className="font-semibold">{result.fromDrug.half_life_range} h</p>
                                    <p className="text-xs text-slate-500 mt-1 capitalize">{result.fromDrug.drug_name}</p>
                                </div>
                                <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800">
                                    <div className="md:flex items-center gap-2 mb-2">
                                        <Clock className="h-4 w-4 text-violet-500" />
                                        <span className="text-xs font-bold uppercase text-slate-500">{t('Demi-vie (Arrivée)')}</span>
                                    </div>
                                    <p className="font-semibold">{result.toDrug.half_life_range} h</p>
                                    <p className="text-xs text-slate-500 mt-1 capitalize">{result.toDrug.drug_name}</p>
                                </div>
                            </div>

                            {/* Alert/Notes */}
                            {(result.fromDrug.notes || result.toDrug.notes) && (
                                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                    <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-400">
                                        <AlertTriangle className="h-4 w-4" />
                                        <span className="font-bold text-sm">{t('Notes Cliniques')}</span>
                                    </div>
                                    <div className="text-sm space-y-2 text-slate-700 dark:text-slate-300">
                                        {result.fromDrug.notes && (
                                            <p><strong>{result.fromDrug.drug_name}:</strong> {result.fromDrug.notes}</p>
                                        )}
                                        {result.toDrug.notes && (
                                            <p><strong>{result.toDrug.drug_name}:</strong> {result.toDrug.notes}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="text-xs text-slate-400 text-center mt-auto pt-4">
                                {t('Ces calculs sont théoriques. La tolérance individuelle varie. Une supervision clinique est requise.')}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-700">
                            <Calculator className="h-12 w-12 mb-4 opacity-50" />
                            <p className="text-center max-w-xs">{t('Sélectionnez les médicaments et la dose pour voir l\'équivalence')}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default SwitchCalculator;
