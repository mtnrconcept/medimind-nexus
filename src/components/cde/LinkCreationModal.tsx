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

interface RelationshipType {
    value: string;
    label: string;
    description: string;
    // Valid source -> target type pairs (empty = valid for all)
    validPairs: Array<{ source: string[]; target: string[] }>;
}

// Comprehensive relationship types with validity rules
const RELATIONSHIP_TYPES: RelationshipType[] = [
    {
        value: 'treats',
        label: 'traite',
        description: 'Le source traite la cible',
        validPairs: [
            { source: ['medication', 'substance', 'treatment'], target: ['pathology', 'symptom'] }
        ]
    },
    {
        value: 'causes',
        label: 'cause',
        description: 'Le source cause la cible',
        validPairs: [
            { source: ['medication', 'substance', 'pathology'], target: ['symptom', 'pathology'] },
            { source: ['pathology'], target: ['symptom'] }
        ]
    },
    {
        value: 'contraindicated',
        label: 'contre-indiqué avec',
        description: 'Le source est contre-indiqué avec la cible',
        validPairs: [
            { source: ['medication', 'substance'], target: ['pathology', 'medication', 'substance', 'treatment'] },
            { source: ['treatment'], target: ['pathology', 'medication'] }
        ]
    },
    {
        value: 'interacts_with',
        label: 'interagit avec',
        description: 'Interaction entre les deux',
        validPairs: [
            { source: ['medication', 'substance'], target: ['medication', 'substance'] }
        ]
    },
    {
        value: 'increases_risk',
        label: 'augmente le risque de',
        description: 'Le source augmente le risque de la cible',
        validPairs: [
            { source: ['medication', 'substance', 'pathology'], target: ['pathology', 'symptom'] }
        ]
    },
    {
        value: 'decreases_risk',
        label: 'diminue le risque de',
        description: 'Le source diminue le risque de la cible',
        validPairs: [
            { source: ['medication', 'substance', 'treatment'], target: ['pathology', 'symptom'] }
        ]
    },
    {
        value: 'has_symptom',
        label: 'présente le symptôme',
        description: 'La cible est un symptôme du source',
        validPairs: [
            { source: ['pathology'], target: ['symptom'] }
        ]
    },
    {
        value: 'metabolized_by',
        label: 'métabolisé par',
        description: 'Le source est métabolisé par la cible (enzyme)',
        validPairs: [
            { source: ['medication', 'substance'], target: ['substance'] }
        ]
    },
    {
        value: 'contains',
        label: 'contient',
        description: 'Le source contient la cible',
        validPairs: [
            { source: ['medication'], target: ['substance'] }
        ]
    },
    {
        value: 'similar_to',
        label: 'similaire à',
        description: 'Le source est similaire à la cible',
        validPairs: [
            { source: ['medication'], target: ['medication'] },
            { source: ['substance'], target: ['substance'] },
            { source: ['pathology'], target: ['pathology'] },
            { source: ['symptom'], target: ['symptom'] },
            { source: ['treatment'], target: ['treatment'] }
        ]
    },
    {
        value: 'alternative_to',
        label: 'alternative à',
        description: 'Le source est une alternative à la cible',
        validPairs: [
            { source: ['medication'], target: ['medication'] },
            { source: ['treatment'], target: ['treatment'] },
            { source: ['substance'], target: ['substance'] }
        ]
    },
    {
        value: 'potentiates',
        label: 'potentialise',
        description: 'Le source renforce l\'effet de la cible',
        validPairs: [
            { source: ['medication', 'substance'], target: ['medication', 'substance'] }
        ]
    },
    {
        value: 'inhibits',
        label: 'inhibe',
        description: 'Le source inhibe la cible',
        validPairs: [
            { source: ['medication', 'substance'], target: ['substance', 'medication'] }
        ]
    },
    {
        value: 'induces',
        label: 'induit',
        description: 'Le source induit/active la cible',
        validPairs: [
            { source: ['medication', 'substance'], target: ['substance'] },
            { source: ['pathology'], target: ['pathology', 'symptom'] }
        ]
    },
    {
        value: 'associated_with',
        label: 'associé à',
        description: 'Association générale',
        validPairs: [] // Valid for all combinations
    },
];

// Check if a relationship is valid for given node types
const isRelationshipValid = (
    relationship: RelationshipType,
    sourceType: string,
    targetType: string
): boolean => {
    // Empty validPairs means valid for all
    if (relationship.validPairs.length === 0) return true;

    return relationship.validPairs.some(pair =>
        pair.source.includes(sourceType) && pair.target.includes(targetType)
    );
};


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
                    user_id: session.user.id, // Correct: References auth.users(id)
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
                            <SelectContent className="max-h-80">
                                {/* Sort: valid relationships first, then invalid */}
                                {[...RELATIONSHIP_TYPES]
                                    .sort((a, b) => {
                                        const aValid = isRelationshipValid(a, sourceNode.node_type, targetNode.node_type);
                                        const bValid = isRelationshipValid(b, sourceNode.node_type, targetNode.node_type);
                                        if (aValid && !bValid) return -1;
                                        if (!aValid && bValid) return 1;
                                        return 0;
                                    })
                                    .map(type => {
                                        const isValid = isRelationshipValid(type, sourceNode.node_type, targetNode.node_type);
                                        return (
                                            <SelectItem
                                                key={type.value}
                                                value={type.value}
                                                disabled={!isValid}
                                                className={!isValid ? 'opacity-50 cursor-not-allowed' : ''}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {isValid ? (
                                                        <span className="text-green-500 text-xs">✓</span>
                                                    ) : (
                                                        <span className="text-red-400 text-xs">✗</span>
                                                    )}
                                                    <div>
                                                        <span className={`font-medium ${!isValid ? 'text-slate-400' : ''}`}>
                                                            {t(type.label)}
                                                        </span>
                                                        <span className={`text-xs ml-2 ${!isValid ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            ({t(type.description)})
                                                        </span>
                                                        {!isValid && (
                                                            <span className="text-xs text-red-400 block">
                                                                Non applicable pour {sourceNode.node_type} → {targetNode.node_type}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
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
