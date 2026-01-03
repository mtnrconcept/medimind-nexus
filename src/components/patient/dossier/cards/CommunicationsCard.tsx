/**
 * CommunicationsCard - Medical correspondence management
 * Features: Letters, emails, phone calls, referrals
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
import { Plus, MessageSquare, Loader2, MoreVertical, Pencil, Trash2, Mail, Phone, FileText, Send, Inbox, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface CommunicationsCardProps {
    patientId: string;
}

interface Communication {
    id: string;
    communication_date: string;
    communication_type: string;
    sender?: string;
    recipient?: string;
    subject?: string;
    content?: string;
    urgency: string;
    status: string;
    notes?: string;
}

const COMMUNICATION_TYPES = [
    { value: 'letter_in', label: 'Courrier reçu', icon: Inbox },
    { value: 'letter_out', label: 'Courrier envoyé', icon: Send },
    { value: 'email_in', label: 'Email reçu', icon: Mail },
    { value: 'email_out', label: 'Email envoyé', icon: Mail },
    { value: 'phone_call', label: 'Appel téléphonique', icon: Phone },
    { value: 'sms', label: 'SMS', icon: MessageSquare },
    { value: 'referral', label: 'Lettre d\'adressage', icon: FileText },
    { value: 'report', label: 'Compte-rendu', icon: FileText },
];

const URGENCY_LEVELS = [
    { value: 'routine', label: 'Routine', color: 'bg-gray-500/10 text-gray-500' },
    { value: 'urgent', label: 'Urgent', color: 'bg-orange-500/10 text-orange-500' },
    { value: 'critical', label: 'Critique', color: 'bg-red-500/10 text-red-500' },
];

const STATUS_OPTIONS = [
    { value: 'pending', label: 'En attente', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'read', label: 'Lu', color: 'bg-blue-500/10 text-blue-500' },
    { value: 'replied', label: 'Répondu', color: 'bg-green-500/10 text-green-500' },
    { value: 'archived', label: 'Archivé', color: 'bg-gray-500/10 text-gray-500' },
];

const CommunicationsCard = ({ patientId }: CommunicationsCardProps) => {
    const [communications, setCommunications] = useState<Communication[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Communication | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        communication_date: new Date().toISOString().slice(0, 16),
        communication_type: 'letter_in',
        sender: '',
        recipient: '',
        subject: '',
        content: '',
        urgency: 'routine',
        status: 'pending',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_communications')
            .select('*')
            .eq('patient_id', patientId)
            .order('communication_date', { ascending: false });
        setCommunications(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            communication_date: new Date().toISOString().slice(0, 16),
            communication_type: 'letter_in',
            sender: '',
            recipient: '',
            subject: '',
            content: '',
            urgency: 'routine',
            status: 'pending',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: Communication) => {
        setEditing(item);
        setFormData({
            communication_date: item.communication_date?.slice(0, 16) || '',
            communication_type: item.communication_type,
            sender: item.sender || '',
            recipient: item.recipient || '',
            subject: item.subject || '',
            content: item.content || '',
            urgency: item.urgency || 'routine',
            status: item.status || 'pending',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_communications').update(formData).eq('id', editing.id);
                toast.success('Communication mise à jour');
            } else {
                await supabase.from('patient_communications').insert({ ...formData, patient_id: patientId });
                toast.success('Communication ajoutée');
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
            await supabase.from('patient_communications').delete().eq('id', id);
            toast.success('Communication supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const pendingCount = communications.filter(c => c.status === 'pending').length;

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{communications.length} message(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {pendingCount > 0 && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-center gap-2 text-yellow-600 text-sm font-medium">
                        <AlertCircle className="h-4 w-4" />
                        {pendingCount} message(s) en attente
                    </div>
                </div>
            )}

            {communications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune correspondance</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {communications.map((comm) => {
                        const typeConfig = COMMUNICATION_TYPES.find(t => t.value === comm.communication_type);
                        const Icon = typeConfig?.icon || MessageSquare;
                        return (
                            <div key={comm.id} className="p-3 rounded-lg border bg-card">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-500">
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm flex items-center gap-2">
                                            {typeConfig?.label || comm.communication_type}
                                            {comm.urgency !== 'routine' && (
                                                <Badge className={URGENCY_LEVELS.find(u => u.value === comm.urgency)?.color}>
                                                    {URGENCY_LEVELS.find(u => u.value === comm.urgency)?.label}
                                                </Badge>
                                            )}
                                        </div>
                                        {comm.subject && <div className="text-xs font-medium mt-1">{comm.subject}</div>}
                                        <div className="text-[10px] text-muted-foreground mt-1">
                                            {format(new Date(comm.communication_date), 'dd/MM/yyyy HH:mm', { locale: fr })}
                                            {comm.sender && <span> • De: {comm.sender}</span>}
                                        </div>
                                    </div>
                                    <Badge className={STATUS_OPTIONS.find(s => s.value === comm.status)?.color}>
                                        {STATUS_OPTIONS.find(s => s.value === comm.status)?.label}
                                    </Badge>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditDialog(comm)}>
                                                <Pencil className="h-4 w-4 mr-2" />Modifier
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(comm.id)}>
                                                <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier' : 'Nouvelle correspondance'}</DialogTitle>
                        <DialogDescription>Gestion des communications</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={formData.communication_type} onValueChange={(v) => setFormData({ ...formData, communication_type: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {COMMUNICATION_TYPES.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input type="datetime-local" value={formData.communication_date} onChange={(e) => setFormData({ ...formData, communication_date: e.target.value })} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Expéditeur</Label>
                                <Input value={formData.sender} onChange={(e) => setFormData({ ...formData, sender: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Destinataire</Label>
                                <Input value={formData.recipient} onChange={(e) => setFormData({ ...formData, recipient: e.target.value })} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Sujet</Label>
                            <Input value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <Label>Contenu</Label>
                            <Textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={3} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Urgence</Label>
                                <Select value={formData.urgency} onValueChange={(v) => setFormData({ ...formData, urgency: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {URGENCY_LEVELS.map((u) => (
                                            <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Statut</Label>
                                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map((s) => (
                                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editing ? 'Mettre à jour' : 'Ajouter'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CommunicationsCard;
