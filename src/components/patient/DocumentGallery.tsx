/**
 * DocumentGallery - Patient document gallery with search and filters
 * 
 * Features:
 * - Grid/List view toggle
 * - Filter by category (ordonnance, analyse, imagerie...)
 * - Filter by date range
 * - Search by filename
 * - Visual indicator for integrated documents (grayed out)
 * - Document preview
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
    FolderOpen,
    Search,
    Grid,
    List,
    FileText,
    FileImage,
    File,
    Calendar,
    Filter,
    Download,
    Eye,
    Trash2,
    CheckCircle,
    MoreVertical,
    Image as ImageIcon,
    ClipboardList,
    Pill,
    Stethoscope,
    X,
    Loader2,
    Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// =====================================================
// TYPES
// =====================================================

interface Document {
    id: string;
    patient_id: string;
    file_name: string;
    file_type: string;
    file_path: string;
    file_size: number;
    category: string;
    extraction_status: string;
    extracted_data: Record<string, unknown> | null;
    integrated_at: string | null;
    created_at: string;
}

interface DocumentGalleryProps {
    patientId: string;
    onDocumentIntegrated?: () => void;
}

// =====================================================
// CONSTANTS
// =====================================================

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
    ordonnance: { label: 'Ordonnance', icon: Pill, color: 'text-blue-500 bg-blue-500/10' },
    compte_rendu: { label: 'Compte-rendu', icon: ClipboardList, color: 'text-purple-500 bg-purple-500/10' },
    imagerie: { label: 'Imagerie', icon: ImageIcon, color: 'text-pink-500 bg-pink-500/10' },
    analyse_biologique: { label: 'Analyse', icon: Stethoscope, color: 'text-green-500 bg-green-500/10' },
    certificat: { label: 'Certificat', icon: FileText, color: 'text-orange-500 bg-orange-500/10' },
    autre: { label: 'Autre', icon: File, color: 'text-gray-500 bg-gray-500/10' },
};

// =====================================================
// COMPONENT
// =====================================================

const DocumentGallery = ({ patientId, onDocumentIntegrated }: DocumentGalleryProps) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Derived state for selection
    // Note: We'll calculate isAllSelected based on *filtered* documents effectively
    // But simple check: are there selected items?

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<string>('all');
    const [showIntegrated, setShowIntegrated] = useState(true);

    // Preview
    const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // =====================================================
    // FETCH DOCUMENTS
    // =====================================================

    const fetchDocuments = async () => {
        if (!patientId) return;
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from('patient_documents')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setDocuments(data || []);
        } catch (error) {
            console.error('Error fetching documents:', error);
            toast.error('Erreur lors du chargement des documents');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [patientId]);

    // =====================================================
    // FILTERED DOCUMENTS
    // =====================================================

    const filteredDocuments = useMemo(() => {
        let filtered = [...documents];

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(doc =>
                doc.file_name.toLowerCase().includes(query)
            );
        }

        // Category filter
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(doc => doc.category === categoryFilter);
        }

        // Date filter
        if (dateFilter !== 'all') {
            const now = new Date();
            const filterDate = new Date();

            switch (dateFilter) {
                case 'week':
                    filterDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    filterDate.setMonth(now.getMonth() - 1);
                    break;
                case 'quarter':
                    filterDate.setMonth(now.getMonth() - 3);
                    break;
                case 'year':
                    filterDate.setFullYear(now.getFullYear() - 1);
                    break;
            }

            filtered = filtered.filter(doc => new Date(doc.created_at) >= filterDate);
        }

        // Integrated filter
        if (!showIntegrated) {
            filtered = filtered.filter(doc => !doc.integrated_at);
        }

        return filtered;
        return filtered;
    }, [documents, searchQuery, categoryFilter, dateFilter, showIntegrated]);

    const isAllSelected = filteredDocuments.length > 0 && filteredDocuments.every(d => selectedIds.includes(d.id));

    // =====================================================
    // SELECTION ACTIONS
    // =====================================================

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            // Select all visible (filtered) documents
            const newIds = new Set(selectedIds);
            filteredDocuments.forEach(d => newIds.add(d.id));
            setSelectedIds(Array.from(newIds));
        } else {
            // Deselect all visible documents
            const visibleIds = new Set(filteredDocuments.map(d => d.id));
            setSelectedIds(selectedIds.filter(id => !visibleIds.has(id)));
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
            console.error('Error deleting:', error);
            toast.error('Erreur lors de la suppression multiple');
        }
    };

    // =====================================================
    // ACTIONS
    // =====================================================

    const handlePreview = async (doc: Document) => {
        setPreviewDoc(doc);
        setPreviewUrl(null);

        try {
            const { data, error } = await supabase.storage
                .from('patient-documents')
                .createSignedUrl(doc.file_path, 3600);

            if (error) {
                console.error('Error getting preview URL:', error);
                toast.error('Impossible de prévisualiser ce fichier');
                return;
            }

            if (data?.signedUrl) {
                setPreviewUrl(data.signedUrl);
            }
        } catch (error) {
            console.error('Error getting preview URL:', error);
            toast.error('Erreur lors de la prévisualisation');
        }
    };

    const handleDownload = async (doc: Document) => {
        try {
            const { data } = await supabase.storage
                .from('patient-documents')
                .download(doc.file_path);

            if (data) {
                const url = URL.createObjectURL(data);
                const link = document.createElement('a');
                link.href = url;
                link.download = doc.file_name;
                link.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error downloading:', error);
            toast.error('Erreur lors du téléchargement');
        }
    };

    const handleDelete = async (doc: Document) => {
        if (!confirm('Supprimer ce document ?')) return;

        try {
            await supabase.storage
                .from('patient-documents')
                .remove([doc.file_path]);

            await supabase
                .from('patient_documents')
                .delete()
                .eq('id', doc.id);

            toast.success('Document supprimé');
            fetchDocuments();
        } catch (error) {
            console.error('Error deleting:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    // =====================================================
    // HELPERS
    // =====================================================

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getFileIcon = (fileType: string) => {
        if (fileType.startsWith('image/')) return FileImage;
        return FileText;
    };

    const getCategoryStats = () => {
        const stats: Record<string, number> = {};
        documents.forEach(doc => {
            stats[doc.category] = (stats[doc.category] || 0) + 1;
        });
        return stats;
    };

    const categoryStats = getCategoryStats();

    // =====================================================
    // RENDER
    // =====================================================

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setLoading(true);
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                // 1. Upload to Storage
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
                const filePath = `${patientId}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('patient-documents')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // 2. Create DB record
                const { data: docData, error: dbError } = await supabase
                    .from('patient_documents')
                    .insert({
                        patient_id: patientId,
                        file_name: file.name,
                        file_type: file.type,
                        file_path: filePath,
                        file_size: file.size,
                        category: 'autre',
                        extraction_status: 'pending'
                    })
                    .select()
                    .single();

                if (dbError) throw dbError;

                // 3. Trigger Analyzer
                const formData = new FormData();
                formData.append('file', file);
                formData.append('documentId', docData.id);
                formData.append('patientId', patientId);

                const { error: analysisError } = await supabase.functions.invoke('document-analyzer', {
                    body: formData,
                });

                if (analysisError) throw analysisError;
                successCount++;

            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);
                failCount++;
            }
        }

        setLoading(false);

        if (successCount > 0) {
            toast.success(`${successCount} document(s) analysé(s) et intégré(s) !`);
            fetchDocuments();
            if (onDocumentIntegrated) onDocumentIntegrated();
        }
        if (failCount > 0) {
            toast.error(`${failCount} échec(s) d'upload/analyse.`);
        }

        // Reset input
        event.target.value = '';
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-primary" />
                        Galerie de documents
                        <Badge variant="secondary" className="ml-2">
                            {documents.length}
                        </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        <div className="relative">
                            <input
                                type="file"
                                id="doc-upload"
                                className="hidden"
                                multiple
                                onChange={handleFileUpload}
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                            />
                            <Button variant="outline" size="sm" onClick={() => document.getElementById('doc-upload')?.click()}>
                                <Upload className="h-4 w-4 mr-2" />
                                Importer
                            </Button>
                        </div>
                        <Button
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setViewMode('grid')}
                        >
                            <Grid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setViewMode('list')}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Bulk Actions Bar */}
                <div className="flex items-center justify-between mt-4 pb-2 border-b border-border/40">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="select-all-docs"
                            checked={isAllSelected}
                            onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                        />
                        <label
                            htmlFor="select-all-docs"
                            className="text-sm text-muted-foreground cursor-pointer select-none"
                        >
                            Tout sélectionner ({filteredDocuments.length})
                        </label>
                    </div>

                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleBulkDelete}
                                className="h-8"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Supprimer la sélection ({selectedIds.length})
                            </Button>
                        </div>
                    )}
                </div>

                {/* Category pills */}
                <div className="flex flex-wrap gap-2 mt-3">
                    <Badge
                        variant={categoryFilter === 'all' ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => setCategoryFilter('all')}
                    >
                        Tous ({documents.length})
                    </Badge>
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                        <Badge
                            key={key}
                            variant={categoryFilter === key ? 'default' : 'outline'}
                            className={cn(
                                "cursor-pointer",
                                categoryFilter !== key && config.color
                            )}
                            onClick={() => setCategoryFilter(key)}
                        >
                            {config.label} ({categoryStats[key] || 0})
                        </Badge>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 mt-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger className="w-[140px]">
                            <Calendar className="h-4 w-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toutes dates</SelectItem>
                            <SelectItem value="week">7 derniers jours</SelectItem>
                            <SelectItem value="month">30 derniers jours</SelectItem>
                            <SelectItem value="quarter">3 derniers mois</SelectItem>
                            <SelectItem value="year">12 derniers mois</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant={showIntegrated ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => setShowIntegrated(!showIntegrated)}
                    >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Intégrés
                    </Button>
                </div>
            </CardHeader>

            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredDocuments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Aucun document trouvé</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <ScrollArea className="h-[400px]">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {filteredDocuments.map((doc) => {
                                const config = CATEGORY_CONFIG[doc.category] || CATEGORY_CONFIG.autre;
                                const Icon = config.icon;
                                const isIntegrated = !!doc.integrated_at;

                                return (
                                    <div
                                        key={doc.id}
                                        className={cn(
                                            "relative group rounded-lg border p-3 transition-all hover:shadow-md cursor-pointer",
                                            isIntegrated && "opacity-50 bg-muted/50"
                                        )}
                                        onClick={() => handlePreview(doc)}
                                    >
                                        {/* Selection Checkbox */}
                                        <div
                                            className="absolute top-2 left-2 z-20"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Checkbox
                                                checked={selectedIds.includes(doc.id)}
                                                onCheckedChange={(checked) => handleSelect(doc.id, checked as boolean)}
                                                className="bg-background/80 backdrop-blur-sm border-2 border-primary/50 data-[state=checked]:bg-primary"
                                            />
                                        </div>
                                        {/* Integrated indicator */}
                                        {isIntegrated && (
                                            <div className="absolute bottom-2 right-2 z-10">
                                                <CheckCircle className="h-4 w-4 text-green-500" />
                                            </div>
                                        )}

                                        {/* Icon */}
                                        <div className={cn("w-full aspect-square rounded-lg flex items-center justify-center mb-2", config.color)}>
                                            <Icon className="h-10 w-10" />
                                        </div>

                                        {/* Info */}
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium truncate" title={doc.file_name}>
                                                {doc.file_name}
                                            </p>
                                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                                <span>{format(new Date(doc.created_at), 'dd/MM/yy')}</span>
                                                <span>{formatFileSize(doc.file_size)}</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                            {isIntegrated && <div className="mb-2" />} {/* Spacer if integrated badge is present */}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="secondary" size="icon" className="h-6 w-6">
                                                        <MoreVertical className="h-3 w-3" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="start">
                                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}>
                                                        <Download className="h-4 w-4 mr-2" /> Télécharger
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                                                        className="text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                ) : (
                    <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                            {filteredDocuments.map((doc) => {
                                const config = CATEGORY_CONFIG[doc.category] || CATEGORY_CONFIG.autre;
                                const Icon = config.icon;
                                const isIntegrated = !!doc.integrated_at;

                                return (
                                    <div
                                        key={doc.id}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer",
                                            isIntegrated && "opacity-50 bg-muted/30"
                                        )}
                                        onClick={() => handlePreview(doc)}
                                    >
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={selectedIds.includes(doc.id)}
                                                onCheckedChange={(checked) => handleSelect(doc.id, checked as boolean)}
                                            />
                                        </div>
                                        <div className={cn("p-2 rounded-lg shrink-0", config.color)}>
                                            <Icon className="h-5 w-5" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-sm truncate">{doc.file_name}</p>
                                                {isIntegrated && (
                                                    <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 shrink-0">
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        Intégré
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                                                <span>{format(new Date(doc.created_at), 'dd MMM yyyy', { locale: fr })}</span>
                                                <span>•</span>
                                                <span>{formatFileSize(doc.file_size)}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                )}
            </CardContent>

            {/* Preview Dialog */}
            <Dialog open={!!previewDoc} onOpenChange={() => { setPreviewDoc(null); setPreviewUrl(null); }}>
                <DialogContent className="max-w-4xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="h-5 w-5" />
                            {previewDoc?.file_name}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Prévisualisation du document
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4">
                        {previewUrl ? (
                            previewDoc?.file_type.startsWith('image/') ? (
                                <img
                                    src={previewUrl}
                                    alt={previewDoc.file_name}
                                    className="max-w-full max-h-[60vh] mx-auto rounded-lg"
                                />
                            ) : previewDoc?.file_type === 'application/pdf' ? (
                                <iframe
                                    src={previewUrl}
                                    className="w-full h-[60vh] rounded-lg"
                                    title={previewDoc.file_name}
                                />
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <FileText className="h-16 w-16 mx-auto mb-3 opacity-50" />
                                    <p>Prévisualisation non disponible</p>
                                    <Button
                                        variant="outline"
                                        className="mt-4"
                                        onClick={() => previewDoc && handleDownload(previewDoc)}
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Télécharger pour voir
                                    </Button>
                                </div>
                            )
                        ) : (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        )}
                    </div>

                    {/* Extracted data */}
                    {previewDoc?.extracted_data && (
                        <div className="mt-4 p-4 rounded-lg bg-muted/50">
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                                <ClipboardList className="h-4 w-4" />
                                Données extraites
                            </h4>
                            <pre className="text-xs overflow-auto max-h-[200px]">
                                {JSON.stringify(previewDoc.extracted_data, null, 2)}
                            </pre>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card >
    );
};

export default DocumentGallery;
