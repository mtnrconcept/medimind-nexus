import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Link2, ArrowRight } from 'lucide-react';

interface Node {
    id: string;
    name: string;
    node_type: string;
}

interface LinkCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceNode: Node | null;
    targetNode: Node | null;
    onLinkCreated?: () => void;
}

const RELATIONSHIP_TYPES = [
    { value: 'treats', label: 'traite', description: 'Le source traite la cible' },
    { value: 'causes', label: 'cause', description: 'Le source cause la cible' },
    { value: 'contraindicated', label: 'contre-indiqué', description: 'Le source est contre-indiqué avec la cible' },
    { value: 'interacts_with', label: 'interagit avec', description: 'Interaction entre les deux' },
    { value: 'increases_risk', label: 'augmente le risque', description: 'Le source augmente le risque de la cible' },
    { value: 'decreases_risk', label: 'diminue le risque', description: 'Le source diminue le risque de la cible' },
    { value: 'has_symptom', label: 'présente le symptôme', description: 'La cible est un symptôme du source' },
    { value: 'metabolized_by', label: 'métabolisé par', description: 'Le source est métabolisé par la cible' },
    { value: 'contains', label: 'contient', description: 'Le source contient la cible' },
    { value: 'similar_to', label: 'similaire à', description: 'Le source est similaire à la cible' },
    { value: 'alternative_to', label: 'alternative à', description: 'Le source est une alternative à la cible' },
    { value: 'potentiates', label: 'potentialise', description: 'Le source renforce l\'effet de la cible' },
    { value: 'inhibits', label: 'inhibe', description: 'Le source inhibe la cible' },
    { value: 'induces', label: 'induit', description: 'Le source induit la cible' },
    { value: 'associated_with', label: 'associé à', description: 'Association générale' },
];

const LinkCreationModal = ({
    isOpen,
    onClose,
    sourceNode,
    targetNode,
    onLinkCreated,
}: LinkCreationModalProps) => {
    const { t } = useAutoTranslation();
    const [relationshipType, setRelationshipType] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!sourceNode || !targetNode || !relationshipType) {
            toast.error(t('Veuillez sélectionner un type de relation'));
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Vous devez être connecté');
            }

            const { error } = await supabase
                .from('cde_user_edges')
                .insert({
                    user_id: session.user.id,
                    source_node_id: sourceNode.id,
                    target_node_id: targetNode.id,
                    relationship_type: relationshipType,
                    notes: notes.trim() || null,
                });

            if (error) {
                if (error.code === '23505') {
                    throw new Error('Ce lien existe déjà');
                }
                throw error;
            }

            toast.success(t('Lien créé avec succès'));
            onLinkCreated?.();
            handleClose();
        } catch (err: any) {
            console.error('Error creating link:', err);
            toast.error(err.message || t('Erreur lors de la création du lien'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setRelationshipType('');
        setNotes('');
        onClose();
    };

    if (!sourceNode || !targetNode) return null;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-violet-500" />
                        {t('Créer un lien')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('Définissez la relation entre ces deux éléments')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Visual representation of the link */}
                    <div className="flex items-center justify-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="text-center">
                            <div className="font-medium text-sm">{sourceNode.name}</div>
                            <div className="text-xs text-slate-500">{sourceNode.node_type}</div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-violet-500" />
                        <div className="text-center">
                            <div className="font-medium text-sm">{targetNode.name}</div>
                            <div className="text-xs text-slate-500">{targetNode.node_type}</div>
                        </div>
                    </div>

                    {/* Relationship type selector */}
                    <div className="space-y-2">
                        <Label>{t('Type de relation')} *</Label>
                        <Select value={relationshipType} onValueChange={setRelationshipType}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('Sélectionnez un type de relation')} />
                            </SelectTrigger>
                            <SelectContent>
                                {RELATIONSHIP_TYPES.map(type => (
                                    <SelectItem key={type.value} value={type.value}>
                                        <div>
                                            <span className="font-medium">{t(type.label)}</span>
                                            <span className="text-xs text-slate-500 ml-2">
                                                ({t(type.description)})
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>{t('Notes (optionnel)')}</Label>
                        <Textarea
                            placeholder={t('Ajoutez des notes ou observations sur ce lien...')}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        {t('Annuler')}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!relationshipType || isSubmitting}
                        className="bg-violet-500 hover:bg-violet-600"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {t('Création...')}
                            </>
                        ) : (
                            <>
                                <Link2 className="h-4 w-4 mr-2" />
                                {t('Créer le lien')}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default LinkCreationModal;
