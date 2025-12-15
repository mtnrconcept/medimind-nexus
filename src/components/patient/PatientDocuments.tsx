import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    FileText,
    Image,
    FileSpreadsheet,
    File as FileIcon,
    Download,
    Trash2,
    Eye,
    RefreshCw,
    Upload,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Stethoscope,
    TestTube,
    FileImage,
    FileCheck,
    FolderOpen,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import DocumentUploader from './DocumentUploader';
import ExtractedDataReview from './ExtractedDataReview';
import type { Database } from '@/integrations/supabase/types';

type PatientDocument = Database['public']['Tables']['patient_documents']['Row'];

interface PatientDocumentsProps {
    patientId: string;
}

const categoryConfig = {
    ordonnance: { label: 'Ordonnances', icon: FileText, color: 'text-blue-500' },
    compte_rendu: { label: 'Comptes-rendus', icon: Stethoscope, color: 'text-purple-500' },
    imagerie: { label: 'Imagerie', icon: FileImage, color: 'text-cyan-500' },
    analyse_biologique: { label: 'Analyses', icon: TestTube, color: 'text-green-500' },
    certificat: { label: 'Certificats', icon: FileCheck, color: 'text-orange-500' },
    autre: { label: 'Autres', icon: FolderOpen, color: 'text-gray-500' },
};

const getFileIcon = (type: string) => {
    if (type.includes('image') || type.includes('jpg') || type.includes('png')) {
        return <Image className="h-5 w-5 text-blue-500" />;
    }
    if (type.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv') || type.includes('xls')) {
        return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
    }
    return <FileIcon className="h-5 w-5 text-gray-500" />;
};

const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function PatientDocuments({ patientId }: PatientDocumentsProps) {
    const [documents, setDocuments] = useState<PatientDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDocument, setSelectedDocument] = useState<PatientDocument | null>(null);
    const [showUploader, setShowUploader] = useState(false);
    const [reanalyzing, setReanalyzing] = useState<string | null>(null);

    const fetchDocuments = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('patient_documents')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching documents:', error);
            toast.error('Erreur lors du chargement des documents');
        } else {
            setDocuments(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchDocuments();
    }, [patientId]);

    const handleDelete = async (doc: PatientDocument) => {
        if (!confirm(`Supprimer "${doc.file_name}" ?`)) return;

        // Delete from storage
        await supabase.storage
            .from('patient-documents')
            .remove([doc.file_path]);

        // Delete record
        const { error } = await supabase
            .from('patient_documents')
            .delete()
            .eq('id', doc.id);

        if (error) {
            toast.error('Erreur lors de la suppression');
        } else {
            toast.success('Document supprimé');
            fetchDocuments();
        }
    };

    const handleReanalyze = async (doc: PatientDocument) => {
        setReanalyzing(doc.id);

        try {
            // Get the file from storage
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('patient-documents')
                .download(doc.file_path);

            if (downloadError) throw downloadError;

            // Create a File object
            const file = new File([fileData], doc.file_name, { type: doc.file_type });

            // Update status to pending
            await supabase
                .from('patient_documents')
                .update({ extraction_status: 'pending' })
                .eq('id', doc.id);

            // Trigger analysis
            const formData = new FormData();
            formData.append('file', file);
            formData.append('documentId', doc.id);
            formData.append('patientId', patientId);

            const { data: { session } } = await supabase.auth.getSession();

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-analyzer`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session?.access_token}`,
                    },
                    body: formData,
                }
            );

            if (!response.ok) {
                throw new Error('Analysis failed');
            }

            toast.success('Réanalyse terminée');
            fetchDocuments();
        } catch (error) {
            console.error('Reanalyze error:', error);
            toast.error('Erreur lors de la réanalyse');
        } finally {
            setReanalyzing(null);
        }
    };

    const handleDownload = async (doc: PatientDocument) => {
        const { data, error } = await supabase.storage
            .from('patient-documents')
            .download(doc.file_path);

        if (error) {
            toast.error('Erreur lors du téléchargement');
            return;
        }

        // Create download link
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return (
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Analysé
                    </Badge>
                );
            case 'processing':
                return (
                    <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/30">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Analyse...
                    </Badge>
                );
            case 'failed':
                return (
                    <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Erreur
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        En attente
                    </Badge>
                );
        }
    };

    const documentsByCategory = documents.reduce((acc, doc) => {
        const category = doc.category || 'autre';
        if (!acc[category]) acc[category] = [];
        acc[category].push(doc);
        return acc;
    }, {} as Record<string, PatientDocument[]>);

    return (
        <Card className="border-border/50">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Documents Médicaux
                        <Badge variant="secondary" className="ml-2">{documents.length}</Badge>
                    </CardTitle>
                    <Dialog open={showUploader} onOpenChange={setShowUploader}>
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                                <Upload className="h-4 w-4 mr-2" />
                                Ajouter
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Ajouter des documents</DialogTitle>
                                <DialogDescription>
                                    Importez des documents médicaux pour extraction automatique des données
                                </DialogDescription>
                            </DialogHeader>
                            <DocumentUploader
                                patientId={patientId}
                                onUploadComplete={() => {
                                    setShowUploader(false);
                                    fetchDocuments();
                                }}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : documents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Aucun document</p>
                        <Button
                            size="sm"
                            variant="outline"
                            className="mt-3"
                            onClick={() => setShowUploader(true)}
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            Ajouter un document
                        </Button>
                    </div>
                ) : (
                    <Tabs defaultValue="all" className="space-y-4">
                        <TabsList className="flex flex-wrap h-auto gap-1">
                            <TabsTrigger value="all" className="text-xs">
                                Tous ({documents.length})
                            </TabsTrigger>
                            {Object.entries(categoryConfig).map(([key, config]) => {
                                const count = documentsByCategory[key]?.length || 0;
                                if (count === 0) return null;
                                const Icon = config.icon;
                                return (
                                    <TabsTrigger key={key} value={key} className="text-xs">
                                        <Icon className={`h-3 w-3 mr-1 ${config.color}`} />
                                        {config.label} ({count})
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>

                        <TabsContent value="all" className="space-y-2">
                            {documents.map(doc => (
                                <DocumentRow
                                    key={doc.id}
                                    doc={doc}
                                    reanalyzing={reanalyzing}
                                    onView={setSelectedDocument}
                                    onDownload={handleDownload}
                                    onReanalyze={handleReanalyze}
                                    onDelete={handleDelete}
                                    getStatusBadge={getStatusBadge}
                                />
                            ))}
                        </TabsContent>

                        {Object.keys(categoryConfig).map(category => (
                            <TabsContent key={category} value={category} className="space-y-2">
                                {(documentsByCategory[category] || []).map(doc => (
                                    <DocumentRow
                                        key={doc.id}
                                        doc={doc}
                                        reanalyzing={reanalyzing}
                                        onView={setSelectedDocument}
                                        onDownload={handleDownload}
                                        onReanalyze={handleReanalyze}
                                        onDelete={handleDelete}
                                        getStatusBadge={getStatusBadge}
                                    />
                                ))}
                            </TabsContent>
                        ))}
                    </Tabs>
                )}

                {/* Document Details Dialog */}
                <Dialog open={!!selectedDocument} onOpenChange={() => setSelectedDocument(null)}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                {selectedDocument && getFileIcon(selectedDocument.file_type)}
                                {selectedDocument?.file_name}
                            </DialogTitle>
                            <DialogDescription>
                                Données extraites du document
                            </DialogDescription>
                        </DialogHeader>
                        {selectedDocument && (
                            <ExtractedDataReview
                                document={selectedDocument}
                                patientId={patientId}
                                onUpdate={() => {
                                    setSelectedDocument(null);
                                    fetchDocuments();
                                }}
                            />
                        )}
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

interface DocumentRowProps {
    doc: PatientDocument;
    reanalyzing: string | null;
    onView: (doc: PatientDocument) => void;
    onDownload: (doc: PatientDocument) => void;
    onReanalyze: (doc: PatientDocument) => void;
    onDelete: (doc: PatientDocument) => void;
    getStatusBadge: (status: string) => JSX.Element;
}

function DocumentRow({
    doc,
    reanalyzing,
    onView,
    onDownload,
    onReanalyze,
    onDelete,
    getStatusBadge,
}: DocumentRowProps) {
    const category = categoryConfig[doc.category as keyof typeof categoryConfig] || categoryConfig.autre;
    const CategoryIcon = category.icon;

    return (
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex-shrink-0">
                {getFileIcon(doc.file_type)}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <Badge variant="outline" className="text-xs">
                        <CategoryIcon className={`h-3 w-3 mr-1 ${category.color}`} />
                        {category.label}
                    </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.file_size)} • {doc.created_at && formatDate(doc.created_at)}
                </p>
            </div>
            <div className="flex items-center gap-2">
                {getStatusBadge(doc.extraction_status)}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onView(doc)}
                    title="Voir les données extraites"
                >
                    <Eye className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDownload(doc)}
                    title="Télécharger"
                >
                    <Download className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onReanalyze(doc)}
                    disabled={reanalyzing === doc.id}
                    title="Réanalyser"
                >
                    {reanalyzing === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => onDelete(doc)}
                    title="Supprimer"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
