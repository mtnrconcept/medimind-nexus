/**
 * MedicalHistoryCard - Complete personal medical history
 * Features: Categories (diseases, surgeries, hospitalizations), timeline, severity
 */

import { DocumentUploadDialog } from '@/components/patient/DocumentUploadDialog';

// ... (existing imports)
import { Plus, Hospital, Loader2, MoreVertical, Pencil, Trash2, Calendar, Stethoscope, Scissors, BedDouble, Activity, Upload } from 'lucide-react';

// ... (existing constants)

const MedicalHistoryCard = ({ patientId }: MedicalHistoryCardProps) => {
    const [history, setHistory] = useState<MedicalHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false); // NEW
    const [editing, setEditing] = useState<MedicalHistory | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('all');

    // ... (existing state)

    // ... (existing functions)

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{history.length} antécédent(s)</span>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
                        <Upload className="h-3 w-3" />
                        Importer
                    </Button>
                    <Button size="sm" variant="default" onClick={() => openAddDialog()}>
                        <Plus className="h-3 w-3 mr-1" />Ajouter
                    </Button>
                </div>
            </div>

            {/* ... (existing content) */}

            {/* ... (existing Add/Edit Dialog) */}
            
            <DocumentUploadDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                patientId={patientId}
                onUploadComplete={() => {
                     toast.success('Document analysé, rechargement des antécédents...');
                     fetchData();
                }}
            />
        </div>
    );
};

export default MedicalHistoryCard;
