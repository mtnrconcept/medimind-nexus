/**
 * AllergiesCard - Complete allergies and intolerances management
 * Features: Add/Edit/Delete, context menus, severity dropdown, type selection
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Plus, AlertTriangle, Pill, Apple, Leaf, Hand, Loader2, MoreVertical, Pencil, Trash2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface AllergiesCardProps {
    patientId: string;
}

interface Allergy {
    id: string;
    allergen: string;
    allergy_type: string;
    severity: string;
    reaction?: string;
    onset_date?: string;
    confirmed: boolean;
}

const ALLERGY_TYPES = [
    { value: 'medication', label: 'Médicament', icon: Pill },
    { value: 'food', label: 'Alimentaire', icon: Apple },
    { value: 'environmental', label: 'Environnementale', icon: Leaf },
    { value: 'contact', label: 'Contact', icon: Hand },
    { value: 'other', label: 'Autre', icon: AlertTriangle },
];

const SEVERITY_OPTIONS = [
    { value: 'mild', label: 'Légère', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
    { value: 'moderate', label: 'Modérée', color: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
    { value: 'severe', label: 'Sévère', color: 'bg-red-500/10 text-red-500 border-red-500/30' },
];

const COMMON_ALLERGENS = {
    medication: ['Pénicilline', 'Aspirine', 'Ibuprofène', 'Sulfamides', 'Codéine', 'Morphine', 'Latex', 'Produits de contraste iodés'],
    food: ['Arachides', 'Fruits à coque', 'Lait', 'Œufs', 'Blé/Gluten', 'Soja', 'Poisson', 'Crustacés', 'Sésame', 'Moutarde'],
    environmental: ['Pollen', 'Acariens', 'Poils de chat', 'Poils de chien', 'Moisissures', 'Poussière'],
    contact: ['Nickel', 'Latex', 'Parfums', 'Cosmétiques'],
    other: [],
};

const AllergiesCard = ({ patientId }: AllergiesCardProps) => {
    const [allergies, setAllergies] = useState<Allergy[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingAllergy, setEditingAllergy] = useState<Allergy | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        allergen: '',
        allergy_type: 'medication',
        severity: 'moderate',
        reaction: '',
        onset_date: '',
        confirmed: true,
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_allergies')
            .select('*')
            .eq('patient_id', patientId)
            .order('severity', { ascending: true });
        setAllergies(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditingAllergy(null);
        setFormData({
            allergen: '',
            allergy_type: 'medication',
            severity: 'moderate',
            reaction: '',
            onset_date: '',
            confirmed: true,
        });
        setDialogOpen(true);
    };

    const openEditDialog = (allergy: Allergy) => {
        setEditingAllergy(allergy);
        setFormData({
            allergen: allergy.allergen,
            allergy_type: allergy.allergy_type,
            severity: allergy.severity,
            reaction: allergy.reaction || '',
            onset_date: allergy.onset_date || '',
            confirmed: allergy.confirmed ?? true,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.allergen.trim()) {
            toast.error('Veuillez saisir un allergène');
            return;
        }

        setSaving(true);
        try {
            if (editingAllergy) {
                await supabase
                    .from('patient_allergies')
                    .update(formData)
                    .eq('id', editingAllergy.id);
                toast.success('Allergie mise à jour');
            } else {
                await supabase
                    .from('patient_allergies')
                    .insert({ ...formData, patient_id: patientId });
                toast.success('Allergie ajoutée');
            }
            setDialogOpen(false);
            fetchData();
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await supabase.from('patient_allergies').delete().eq('id', id);
            toast.success('Allergie supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur lors de la suppression');
        }
    };

    const toggleConfirmed = async (allergy: Allergy) => {
        try {
            await supabase
                .from('patient_allergies')
                .update({ confirmed: !allergy.confirmed })
                .eq('id', allergy.id);
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const getTypeIcon = (type: string) => {
        const config = ALLERGY_TYPES.find(t => t.value === type);
        if (config) {
            const Icon = config.icon;
            return <Icon className="h-4 w-4" />;
        }
        return <AlertTriangle className="h-4 w-4" />;
    };

    const getSeverityColor = (severity: string) => {
        return SEVERITY_OPTIONS.find(s => s.value === severity)?.color || 'bg-muted';
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{allergies.length} allergie(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {allergies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune allergie connue</p>
                    <Button variant="link" size="sm" onClick={openAddDialog}>
                        Ajouter une allergie
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {allergies.map((allergy) => (
                        <div
                            key={allergy.id}
                            className={`p-3 rounded-lg border ${getSeverityColor(allergy.severity)} ${!allergy.confirmed ? 'opacity-60' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-background/50">
                                    {getTypeIcon(allergy.allergy_type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm flex items-center gap-2">
                                        {allergy.allergen}
                                        {!allergy.confirmed && (
                                            <Badge variant="outline" className="text-[10px]">Non confirmée</Badge>
                                        )}
                                    </div>
                                    {allergy.reaction && (
                                        <div className="text-xs text-muted-foreground mt-1 truncate">{allergy.reaction}</div>
                                    )}
                                </div>
                                <Badge variant="outline" className={getSeverityColor(allergy.severity)}>
                                    {SEVERITY_OPTIONS.find(s => s.value === allergy.severity)?.label || allergy.severity}
                                </Badge>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openEditDialog(allergy)}>
                                            <Pencil className="h-4 w-4 mr-2" />Modifier
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => toggleConfirmed(allergy)}>
                                            <Check className="h-4 w-4 mr-2" />
                                            {allergy.confirmed ? 'Marquer non confirmée' : 'Confirmer'}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={() => handleDelete(allergy.id)}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingAllergy ? 'Modifier l\'allergie' : 'Ajouter une allergie'}
                        </DialogTitle>
                        <DialogDescription>
                            Renseignez les informations de l'allergie
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Type d'allergie</Label>
                            <Select
                                value={formData.allergy_type}
                                onValueChange={(value) => setFormData({ ...formData, allergy_type: value, allergen: '' })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ALLERGY_TYPES.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>
                                            <div className="flex items-center gap-2">
                                                <type.icon className="h-4 w-4" />
                                                {type.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Allergène</Label>
                            <Select
                                value={formData.allergen}
                                onValueChange={(value) => setFormData({ ...formData, allergen: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Sélectionner ou saisir..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {(COMMON_ALLERGENS[formData.allergy_type as keyof typeof COMMON_ALLERGENS] || []).map((a) => (
                                        <SelectItem key={a} value={a}>{a}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">Autre (saisir)</SelectItem>
                                </SelectContent>
                            </Select>
                            {formData.allergen === '__custom__' && (
                                <Input
                                    placeholder="Saisir l'allergène..."
                                    value=""
                                    onChange={(e) => setFormData({ ...formData, allergen: e.target.value })}
                                />
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Sévérité</Label>
                            <Select
                                value={formData.severity}
                                onValueChange={(value) => setFormData({ ...formData, severity: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SEVERITY_OPTIONS.map((sev) => (
                                        <SelectItem key={sev.value} value={sev.value}>
                                            <Badge className={sev.color}>{sev.label}</Badge>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Réaction</Label>
                            <Textarea
                                placeholder="Décrivez la réaction allergique..."
                                value={formData.reaction}
                                onChange={(e) => setFormData({ ...formData, reaction: e.target.value })}
                                rows={2}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Date de découverte (optionnel)</Label>
                            <Input
                                type="date"
                                value={formData.onset_date}
                                onChange={(e) => setFormData({ ...formData, onset_date: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editingAllergy ? 'Mettre à jour' : 'Ajouter'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AllergiesCard;
