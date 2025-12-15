/**
 * PatientAdministrativeEditor - Extended administrative data editor
 * 
 * Manages:
 * - Emergency contact
 * - Insurance information
 * - Primary physician
 * - Advance directives
 * - Professional status
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    User,
    Phone,
    Shield,
    Briefcase,
    Heart,
    Save,
    Loader2,
    AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface PatientAdministrativeEditorProps {
    patientId: string;
}

interface AdminData {
    id?: string;
    patient_id: string;
    birth_name: string | null;
    birth_place: string | null;
    biological_sex: string | null;
    social_security_number: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
    marital_status: string | null;
    number_of_children: number;
    profession: string | null;
    professional_status: string | null;
    employer: string | null;
    insurance_provider: string | null;
    insurance_policy_number: string | null;
    complementary_insurance: string | null;
    primary_physician_name: string | null;
    primary_physician_phone: string | null;
    advance_directives: boolean;
    advance_directives_date: string | null;
    organ_donor: boolean | null;
    trusted_person_name: string | null;
    trusted_person_phone: string | null;
}

const defaultData: AdminData = {
    patient_id: '',
    birth_name: null,
    birth_place: null,
    biological_sex: null,
    social_security_number: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relationship: null,
    marital_status: null,
    number_of_children: 0,
    profession: null,
    professional_status: null,
    employer: null,
    insurance_provider: null,
    insurance_policy_number: null,
    complementary_insurance: null,
    primary_physician_name: null,
    primary_physician_phone: null,
    advance_directives: false,
    advance_directives_date: null,
    organ_donor: null,
    trusted_person_name: null,
    trusted_person_phone: null,
};

const PatientAdministrativeEditor = ({ patientId }: PatientAdministrativeEditorProps) => {
    const [data, setData] = useState<AdminData>({ ...defaultData, patient_id: patientId });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: adminData, error } = await supabase
                .from('patient_administrative')
                .select('*')
                .eq('patient_id', patientId)
                .maybeSingle();

            if (error) throw error;

            if (adminData) {
                setData(adminData as AdminData);
            } else {
                setData({ ...defaultData, patient_id: patientId });
            }
        } catch (error) {
            console.error('Error fetching admin data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: keyof AdminData, value: string | number | boolean | null) => {
        setData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (data.id) {
                const { error } = await supabase
                    .from('patient_administrative')
                    .update(data)
                    .eq('id', data.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('patient_administrative')
                    .insert(data);
                if (error) throw error;
            }
            toast.success('Informations sauvegardées');
            setHasChanges(false);
            fetchData();
        } catch (error) {
            console.error('Error saving:', error);
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        Informations Administratives
                    </CardTitle>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                        Sauvegarder
                    </Button>
                </div>
            </CardHeader>

            <CardContent>
                <Accordion type="multiple" defaultValue={['emergency', 'insurance']} className="space-y-2">
                    {/* Emergency Contact */}
                    <AccordionItem value="emergency" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                Contact d'urgence
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Nom</Label>
                                    <Input
                                        value={data.emergency_contact_name || ''}
                                        onChange={(e) => handleChange('emergency_contact_name', e.target.value)}
                                        placeholder="Nom complet"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Téléphone</Label>
                                    <Input
                                        value={data.emergency_contact_phone || ''}
                                        onChange={(e) => handleChange('emergency_contact_phone', e.target.value)}
                                        placeholder="+33..."
                                    />
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs">Lien de parenté</Label>
                                <Select
                                    value={data.emergency_contact_relationship || ''}
                                    onValueChange={(v) => handleChange('emergency_contact_relationship', v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Sélectionner..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="spouse">Conjoint(e)</SelectItem>
                                        <SelectItem value="parent">Parent</SelectItem>
                                        <SelectItem value="child">Enfant</SelectItem>
                                        <SelectItem value="sibling">Frère/Sœur</SelectItem>
                                        <SelectItem value="friend">Ami(e)</SelectItem>
                                        <SelectItem value="other">Autre</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Insurance */}
                    <AccordionItem value="insurance" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-blue-500" />
                                Assurance Maladie
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <div>
                                <Label className="text-xs">N° Sécurité Sociale</Label>
                                <Input
                                    value={data.social_security_number || ''}
                                    onChange={(e) => handleChange('social_security_number', e.target.value)}
                                    placeholder="X XX XX XX XXX XXX XX"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Organisme</Label>
                                    <Input
                                        value={data.insurance_provider || ''}
                                        onChange={(e) => handleChange('insurance_provider', e.target.value)}
                                        placeholder="CPAM, MSA..."
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">N° Adhérent</Label>
                                    <Input
                                        value={data.insurance_policy_number || ''}
                                        onChange={(e) => handleChange('insurance_policy_number', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs">Mutuelle complémentaire</Label>
                                <Input
                                    value={data.complementary_insurance || ''}
                                    onChange={(e) => handleChange('complementary_insurance', e.target.value)}
                                    placeholder="Nom de la mutuelle"
                                />
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Professional */}
                    <AccordionItem value="professional" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-green-500" />
                                Situation professionnelle
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Profession</Label>
                                    <Input
                                        value={data.profession || ''}
                                        onChange={(e) => handleChange('profession', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Statut</Label>
                                    <Select
                                        value={data.professional_status || ''}
                                        onValueChange={(v) => handleChange('professional_status', v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="employed">Salarié(e)</SelectItem>
                                            <SelectItem value="self_employed">Indépendant(e)</SelectItem>
                                            <SelectItem value="unemployed">Sans emploi</SelectItem>
                                            <SelectItem value="retired">Retraité(e)</SelectItem>
                                            <SelectItem value="student">Étudiant(e)</SelectItem>
                                            <SelectItem value="disabled">Invalidité</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs">Employeur</Label>
                                <Input
                                    value={data.employer || ''}
                                    onChange={(e) => handleChange('employer', e.target.value)}
                                />
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Primary Physician */}
                    <AccordionItem value="physician" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-purple-500" />
                                Médecin traitant
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Nom</Label>
                                    <Input
                                        value={data.primary_physician_name || ''}
                                        onChange={(e) => handleChange('primary_physician_name', e.target.value)}
                                        placeholder="Dr..."
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Téléphone</Label>
                                    <Input
                                        value={data.primary_physician_phone || ''}
                                        onChange={(e) => handleChange('primary_physician_phone', e.target.value)}
                                    />
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Advance Directives */}
                    <AccordionItem value="directives" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                                <Heart className="h-4 w-4 text-pink-500" />
                                Directives anticipées
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <div className="flex items-center justify-between">
                                <Label>Directives anticipées rédigées</Label>
                                <Switch
                                    checked={data.advance_directives}
                                    onCheckedChange={(v) => handleChange('advance_directives', v)}
                                />
                            </div>
                            {data.advance_directives && (
                                <div>
                                    <Label className="text-xs">Date de rédaction</Label>
                                    <Input
                                        type="date"
                                        value={data.advance_directives_date || ''}
                                        onChange={(e) => handleChange('advance_directives_date', e.target.value)}
                                    />
                                </div>
                            )}
                            <div className="flex items-center justify-between">
                                <Label>Donneur d'organes</Label>
                                <Switch
                                    checked={data.organ_donor || false}
                                    onCheckedChange={(v) => handleChange('organ_donor', v)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Personne de confiance</Label>
                                    <Input
                                        value={data.trusted_person_name || ''}
                                        onChange={(e) => handleChange('trusted_person_name', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Téléphone</Label>
                                    <Input
                                        value={data.trusted_person_phone || ''}
                                        onChange={(e) => handleChange('trusted_person_phone', e.target.value)}
                                    />
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Family Situation */}
                    <AccordionItem value="family" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-orange-500" />
                                Situation familiale
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Statut marital</Label>
                                    <Select
                                        value={data.marital_status || ''}
                                        onValueChange={(v) => handleChange('marital_status', v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="single">Célibataire</SelectItem>
                                            <SelectItem value="married">Marié(e)</SelectItem>
                                            <SelectItem value="pacs">Pacsé(e)</SelectItem>
                                            <SelectItem value="cohabiting">Concubinage</SelectItem>
                                            <SelectItem value="divorced">Divorcé(e)</SelectItem>
                                            <SelectItem value="widowed">Veuf/Veuve</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs">Nombre d'enfants</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={data.number_of_children}
                                        onChange={(e) => handleChange('number_of_children', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Nom de naissance</Label>
                                    <Input
                                        value={data.birth_name || ''}
                                        onChange={(e) => handleChange('birth_name', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Lieu de naissance</Label>
                                    <Input
                                        value={data.birth_place || ''}
                                        onChange={(e) => handleChange('birth_place', e.target.value)}
                                    />
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
};

export default PatientAdministrativeEditor;
