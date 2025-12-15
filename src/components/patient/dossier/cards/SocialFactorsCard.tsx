/**
 * SocialFactorsCard - Social determinants of health
 * Features: Housing, employment, education, support network
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Home, Briefcase, GraduationCap, Users, Heart, Car, Loader2, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface SocialFactorsCardProps {
    patientId: string;
}

interface SocialFactors {
    id?: string;
    // Housing
    housing_status: string;
    housing_type: string;
    living_alone: boolean;
    // Employment
    employment_status: string;
    occupation?: string;
    // Education
    education_level: string;
    // Support
    has_family_support: boolean;
    has_caregiver: boolean;
    caregiver_name?: string;
    // Mobility
    has_transportation: boolean;
    mobility_issues: boolean;
    // Financial
    financial_difficulties: boolean;
    has_health_insurance: boolean;
    // Vulnerabilities
    is_isolated: boolean;
    language_barriers: boolean;
    notes?: string;
}

const HOUSING_STATUS = [
    { value: 'owner', label: 'Propriétaire' },
    { value: 'tenant', label: 'Locataire' },
    { value: 'family', label: 'Hébergé famille' },
    { value: 'social', label: 'Logement social' },
    { value: 'shelter', label: 'Hébergement d\'urgence' },
    { value: 'homeless', label: 'Sans domicile' },
    { value: 'institution', label: 'Institution (EHPAD, etc.)' },
];

const HOUSING_TYPES = [
    { value: 'house', label: 'Maison' },
    { value: 'apartment', label: 'Appartement' },
    { value: 'studio', label: 'Studio' },
    { value: 'care_home', label: 'Maison de retraite' },
    { value: 'assisted', label: 'Résidence services' },
];

const EMPLOYMENT_STATUS = [
    { value: 'employed_full', label: 'Emploi temps plein' },
    { value: 'employed_part', label: 'Emploi temps partiel' },
    { value: 'self_employed', label: 'Indépendant' },
    { value: 'unemployed', label: 'Sans emploi' },
    { value: 'retired', label: 'Retraité' },
    { value: 'student', label: 'Étudiant' },
    { value: 'disability', label: 'Invalidité' },
    { value: 'homemaker', label: 'Au foyer' },
];

const EDUCATION_LEVELS = [
    { value: 'none', label: 'Sans diplôme' },
    { value: 'primary', label: 'Primaire' },
    { value: 'secondary', label: 'Secondaire (Brevet)' },
    { value: 'high_school', label: 'Baccalauréat' },
    { value: 'bachelor', label: 'Licence (Bac+3)' },
    { value: 'master', label: 'Master (Bac+5)' },
    { value: 'doctorate', label: 'Doctorat' },
];

const SocialFactorsCard = ({ patientId }: SocialFactorsCardProps) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [data, setData] = useState<SocialFactors>({
        housing_status: 'tenant',
        housing_type: 'apartment',
        living_alone: false,
        employment_status: 'employed_full',
        occupation: '',
        education_level: 'high_school',
        has_family_support: true,
        has_caregiver: false,
        caregiver_name: '',
        has_transportation: true,
        mobility_issues: false,
        financial_difficulties: false,
        has_health_insurance: true,
        is_isolated: false,
        language_barriers: false,
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data: result } = await supabase
            .from('patient_social_factors')
            .select('*')
            .eq('patient_id', patientId)
            .maybeSingle();
        if (result) setData(result);
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = { ...data, patient_id: patientId };
            if (data.id) {
                await supabase.from('patient_social_factors').update(payload).eq('id', data.id);
            } else {
                const { data: result } = await supabase.from('patient_social_factors').insert(payload).select().single();
                if (result) setData(result);
            }
            setSaved(true);
            toast.success('Facteurs sociaux mis à jour');
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof SocialFactors, value: any) => {
        setData({ ...data, [field]: value });
        setSaved(false);
    };

    // Vulnerability indicators
    const vulnerabilities = [];
    if (data.is_isolated) vulnerabilities.push('Isolement');
    if (data.financial_difficulties) vulnerabilities.push('Difficultés financières');
    if (!data.has_health_insurance) vulnerabilities.push('Sans couverture santé');
    if (data.housing_status === 'homeless' || data.housing_status === 'shelter') vulnerabilities.push('Précarité logement');
    if (data.language_barriers) vulnerabilities.push('Barrière linguistique');

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> : <Save className="h-4 w-4 mr-2" />}
                    {saved ? 'Enregistré' : 'Sauvegarder'}
                </Button>
            </div>

            {/* Vulnerability alerts */}
            {vulnerabilities.length > 0 && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                    <div className="flex items-center gap-2 text-orange-500 text-sm font-medium mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        Points de vigilance
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {vulnerabilities.map((v, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] bg-orange-500/5 text-orange-500 border-orange-500/30">
                                {v}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                {/* Housing */}
                <Card className="col-span-2">
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <Home className="h-4 w-4 text-teal-500" />
                            <Label className="text-sm font-medium">Logement</Label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Select value={data.housing_status} onValueChange={(v) => updateField('housing_status', v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {HOUSING_STATUS.map((h) => (
                                        <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={data.housing_type} onValueChange={(v) => updateField('housing_type', v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {HOUSING_TYPES.map((h) => (
                                        <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <input
                                type="checkbox"
                                checked={data.living_alone}
                                onChange={(e) => updateField('living_alone', e.target.checked)}
                                className="rounded"
                            />
                            <Label className="text-xs">Vit seul(e)</Label>
                        </div>
                    </CardContent>
                </Card>

                {/* Employment */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Briefcase className="h-4 w-4 text-blue-500" />
                            <Label className="text-xs font-medium">Emploi</Label>
                        </div>
                        <Select value={data.employment_status} onValueChange={(v) => updateField('employment_status', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {EMPLOYMENT_STATUS.map((e) => (
                                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            className="mt-2 h-8 text-xs"
                            placeholder="Profession..."
                            value={data.occupation || ''}
                            onChange={(e) => updateField('occupation', e.target.value)}
                        />
                    </CardContent>
                </Card>

                {/* Education */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <GraduationCap className="h-4 w-4 text-purple-500" />
                            <Label className="text-xs font-medium">Éducation</Label>
                        </div>
                        <Select value={data.education_level} onValueChange={(v) => updateField('education_level', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {EDUCATION_LEVELS.map((e) => (
                                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* Support */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="h-4 w-4 text-green-500" />
                            <Label className="text-xs font-medium">Entourage</Label>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={data.has_family_support} onChange={(e) => updateField('has_family_support', e.target.checked)} className="rounded" />
                                <Label className="text-xs">Soutien familial</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={data.has_caregiver} onChange={(e) => updateField('has_caregiver', e.target.checked)} className="rounded" />
                                <Label className="text-xs">Aidant</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={data.is_isolated} onChange={(e) => updateField('is_isolated', e.target.checked)} className="rounded" />
                                <Label className="text-xs text-orange-500">Isolement social</Label>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Mobility & Access */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Car className="h-4 w-4 text-indigo-500" />
                            <Label className="text-xs font-medium">Mobilité</Label>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={data.has_transportation} onChange={(e) => updateField('has_transportation', e.target.checked)} className="rounded" />
                                <Label className="text-xs">Moyen de transport</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={data.mobility_issues} onChange={(e) => updateField('mobility_issues', e.target.checked)} className="rounded" />
                                <Label className="text-xs">Difficultés de mobilité</Label>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Financial & Insurance */}
                <Card className="col-span-2">
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Heart className="h-4 w-4 text-rose-500" />
                            <Label className="text-xs font-medium">Couverture & Situation</Label>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={data.has_health_insurance} onChange={(e) => updateField('has_health_insurance', e.target.checked)} className="rounded" />
                                <Label className="text-xs">Couverture santé</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={data.financial_difficulties} onChange={(e) => updateField('financial_difficulties', e.target.checked)} className="rounded" />
                                <Label className="text-xs text-orange-500">Difficultés financières</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={data.language_barriers} onChange={(e) => updateField('language_barriers', e.target.checked)} className="rounded" />
                                <Label className="text-xs">Barrière linguistique</Label>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Notes */}
            <div className="space-y-2">
                <Label className="text-xs">Notes complémentaires</Label>
                <Textarea
                    value={data.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    rows={2}
                    className="text-xs"
                    placeholder="Informations sociales supplémentaires..."
                />
            </div>
        </div>
    );
};

export default SocialFactorsCard;
