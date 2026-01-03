/**
 * DocumentGalleryPanel - Document upload and analysis with auto-dispatch
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
    Upload,
    FileText,
    Image as ImageIcon,
    File,
    CheckCircle,
    AlertCircle,
    Loader2,
    Sparkles,
    Eye,
    Trash2,
    X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

interface DocumentGalleryPanelProps {
    patientId: string;
    onDataIntegrated?: () => void;
}

interface Document {
    id: string;
    file_name: string;
    file_type: string;
    file_path: string;
    category: string;
    status: 'pending' | 'processing' | 'analyzed' | 'failed';
    extracted_data?: any;
    integration_status?: string;
    created_at: string;
}

const DocumentGalleryPanel = ({ patientId, onDataIntegrated }: DocumentGalleryPanelProps) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const isAllSelected = documents.length > 0 && selectedIds.length === documents.length;

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(documents.map(d => d.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelect = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds(prev => [...prev, id]);
        } else {
            setSelectedIds(prev => prev.filter(item => item !== id));
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Voulez-vous vraiment supprimer ${selectedIds.length} documents ?`)) return;

        const docsToDelete = documents.filter(d => selectedIds.includes(d.id));

        try {
            // Delete from storage
            const pathsToRemove = docsToDelete.map(d => d.file_path);
            if (pathsToRemove.length > 0) {
                await supabase.storage.from('patient-documents').remove(pathsToRemove);
            }

            // Delete from DB
            await supabase.from('patient_documents').delete().in('id', selectedIds);

            toast.success(`${selectedIds.length} documents supprimés`);
            setSelectedIds([]);
            fetchDocuments();
        } catch (error) {
            toast.error('Erreur lors de la suppression multiple');
            console.error(error);
        }
    };

    const fetchDocuments = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_documents')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false });
        setDocuments(data || []);
        setLoading(false);
    }, [patientId]);

    // Fetch on mount
    useState(() => {
        fetchDocuments();
    });

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        setUploadProgress(0);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const filePath = `${patientId}/${Date.now()}-${file.name}`;

            try {
                // Upload to storage
                const { error: uploadError } = await supabase.storage
                    .from('patient-documents')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // Create document record
                const { data: docData, error: docError } = await supabase
                    .from('patient_documents')
                    .insert({
                        patient_id: patientId,
                        file_name: file.name,
                        file_type: file.type,
                        file_path: filePath,
                        file_size: file.size,
                        category: detectCategory(file.name),
                        status: 'pending'
                    })
                    .select()
                    .single();

                if (docError) throw docError;

                setUploadProgress(((i + 1) / files.length) * 100);

                // Immediately trigger analysis
                if (docData) {
                    analyzeDocument(docData.id);
                }
            } catch (error) {
                console.error('Upload error:', error);
                toast.error(`Erreur upload: ${file.name}`);
            }
        }

        setUploading(false);
        fetchDocuments();
        event.target.value = '';
    };

    const detectCategory = (filename: string): string => {
        const lower = filename.toLowerCase();
        if (lower.includes('ordo') || lower.includes('prescription')) return 'prescription';
        if (lower.includes('bio') || lower.includes('sang') || lower.includes('analyse')) return 'lab_results';
        if (lower.includes('radio') || lower.includes('scanner') || lower.includes('irm') || lower.includes('echo')) return 'imaging';
        if (lower.includes('vaccin')) return 'vaccination';
        if (lower.includes('cr') || lower.includes('compte') || lower.includes('consult')) return 'consultation';
        return 'other';
    };

    const analyzeDocument = async (documentId: string) => {
        setAnalyzing(documentId);

        try {
            // Find the document to get file path
            const doc = documents.find(d => d.id === documentId);
            if (!doc) throw new Error('Document non trouvé');

            // Download file from storage
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('patient-documents')
                .download(doc.file_path);

            if (downloadError) throw downloadError;
            if (!fileData) throw new Error('Fichier vide');

            // Create a File object from the blob
            const file = new File([fileData], doc.file_name, { type: doc.file_type });

            // Get auth session
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Non connecté');

            // Create FormData with file, documentId AND patientId
            const formData = new FormData();
            formData.append('file', file);
            formData.append('documentId', documentId);
            formData.append('patientId', patientId);

            // Call the edge function with proper data
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-analyzer`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: formData,
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Analyse échouée');
            }

            const result = await response.json();

            // Show what was integrated
            if (result.integrated && result.integrated.length > 0) {
                toast.success(`Document analysé! ${result.integrated.length} données intégrées: ${result.integrated.slice(0, 3).join(', ')}${result.integrated.length > 3 ? '...' : ''}`);
            } else {
                toast.success('Document analysé!');
            }

            fetchDocuments();

            // Notify parent to refresh analysis
            if (onDataIntegrated) {
                onDataIntegrated();
            }
        } catch (error) {
            console.error('Analysis error:', error);
            toast.error(`Erreur: ${error instanceof Error ? error.message : 'Analyse échouée'}`);
        } finally {
            setAnalyzing(null);
        }
    };

    const handlePreview = async (doc: Document) => {
        setPreviewDoc(doc);
        setPreviewUrl(null);

        try {
            const { data, error } = await supabase.storage
                .from('patient-documents')
                .createSignedUrl(doc.file_path, 3600);

            if (error) {
                toast.error('Impossible de prévisualiser');
                return;
            }

            if (data?.signedUrl) {
                setPreviewUrl(data.signedUrl);
            }
        } catch (error) {
            console.error('Preview error:', error);
        }
    };

    const handleDelete = async (doc: Document) => {
        try {
            await supabase.storage.from('patient-documents').remove([doc.file_path]);
            await supabase.from('patient_documents').delete().eq('id', doc.id);
            toast.success('Document supprimé');
            fetchDocuments();
        } catch (error) {
            toast.error('Erreur de suppression');
        }
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
        if (mimeType.includes('pdf')) return <FileText className="h-4 w-4" />;
        return <File className="h-4 w-4" />;
    };

    const getStatusBadge = (status: string, integration?: string) => {
        if (status === 'analyzed' && integration === 'success') {
            return <Badge className="bg-green-500/10 text-green-500 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Intégré</Badge>;
        }
        if (status === 'processing') {
            return <Badge className="bg-blue-500/10 text-blue-500 text-[10px]"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Analyse...</Badge>;
        }
        if (status === 'failed') {
            return <Badge className="bg-red-500/10 text-red-500 text-[10px]"><AlertCircle className="h-3 w-3 mr-1" />Échec</Badge>;
        }
        return <Badge variant="outline" className="text-[10px]">En attente</Badge>;
    };

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        Documents & Analyses
                        <Sparkles className="h-3 w-3 text-yellow-500" />
                    </CardTitle>
                    <label>
                        <input
                            type="file"
                            className="hidden"
                            multiple
                            accept="image/*,.pdf,.csv,.xlsx,.xls,.doc,.docx"
                            onChange={handleUpload}
                            disabled={uploading}
                        />
                        <Button asChild variant="outline" size="sm" disabled={uploading}>
                            <span className="cursor-pointer">
                                {uploading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <><Upload className="h-4 w-4 mr-1" />Ajouter</>
                                )}
                            </span>
                        </Button>
                    </label>
                </div>
                <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="select-all"
                            checked={isAllSelected}
                            onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                        />
                        <label
                            htmlFor="select-all"
                            className="text-xs text-muted-foreground cursor-pointer select-none"
                        >
                            Tout sélectionner
                        </label>
                    </div>

                    {selectedIds.length > 0 && (
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handleBulkDelete}
                        >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Supprimer ({selectedIds.length})
                        </Button>
                    )}

                    {selectedIds.length === 0 && uploading && <Progress value={uploadProgress} className="h-1 flex-1 ml-4" />}
                </div>
            </CardHeader>

            <CardContent>
                <ScrollArea className="h-[250px]">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Aucun document</p>
                            <p className="text-xs mt-1">Uploadez des documents pour analyse IA</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {documents.map((doc) => (
                                <div
                                    key={doc.id}
                                    className="p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={selectedIds.includes(doc.id)}
                                            onCheckedChange={(checked) => handleSelect(doc.id, checked as boolean)}
                                        />
                                        <div className="p-2 rounded bg-muted">
                                            {getFileIcon(doc.file_type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{doc.file_name}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-muted-foreground">
                                                    {format(new Date(doc.created_at), 'dd/MM/yyyy', { locale: fr })}
                                                </span>
                                                {getStatusBadge(doc.status, doc.integration_status)}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {doc.status === 'pending' && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => analyzeDocument(doc.id)}
                                                    disabled={analyzing === doc.id}
                                                >
                                                    {analyzing === doc.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="h-3 w-3 text-yellow-500" />
                                                    )}
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => handlePreview(doc)}
                                            >
                                                <Eye className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive"
                                                onClick={() => handleDelete(doc)}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>

            {/* Preview Dialog */}
            <Dialog open={!!previewDoc} onOpenChange={() => { setPreviewDoc(null); setPreviewUrl(null); }}>
                <DialogContent className="max-w-4xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="h-5 w-5" />
                            {previewDoc?.file_name}
                        </DialogTitle>
                        <DialogDescription className="sr-only">Prévisualisation du document</DialogDescription>
                    </DialogHeader>
                    <div className="mt-4">
                        {previewUrl ? (
                            previewDoc?.file_type.startsWith('image/') ? (
                                <img src={previewUrl} alt={previewDoc?.file_name} className="max-w-full max-h-[70vh] object-contain mx-auto" />
                            ) : previewDoc?.file_type === 'application/pdf' ? (
                                <iframe src={previewUrl} className="w-full h-[70vh]" />
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <File className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p>Prévisualisation non disponible</p>
                                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                        Télécharger le fichier
                                    </a>
                                </div>
                            )
                        ) : (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
};

export default DocumentGalleryPanel;
