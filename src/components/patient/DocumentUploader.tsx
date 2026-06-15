import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, X, FileText, Image, FileSpreadsheet, File, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DocumentUploaderProps {
    patientId: string;
    onUploadComplete?: () => void;
    category?: string;
}

interface UploadingFile {
    file: File;
    progress: number;
    status: 'pending' | 'uploading' | 'analyzing' | 'complete' | 'error';
    error?: string;
    documentId?: string;
}

const ACCEPTED_FILE_TYPES = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'text/csv': ['.csv'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
};

const getFileIcon = (type: string) => {
    if (type.includes('image')) return <Image className="h-5 w-5 text-blue-500" />;
    if (type.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) {
        return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
    }
    return <File className="h-5 w-5 text-gray-500" />;
};

const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DocumentUploader({ patientId, onUploadComplete, category }: DocumentUploaderProps) {
    const [files, setFiles] = useState<UploadingFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const newFiles: UploadingFile[] = acceptedFiles.map(file => ({
            file,
            progress: 0,
            status: 'pending',
        }));
        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: ACCEPTED_FILE_TYPES,
        maxSize: 10 * 1024 * 1024, // 10MB
    });

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const uploadFiles = async () => {
        setIsUploading(true);
        const pendingFiles = files.filter(f => f.status === 'pending');

        for (let i = 0; i < pendingFiles.length; i++) {
            const fileIndex = files.findIndex(f => f === pendingFiles[i]);
            const { file } = pendingFiles[i];

            try {
                // Update status to uploading
                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? { ...f, status: 'uploading', progress: 10 } : f
                ));

                // Generate unique file path
                const fileExt = file.name.split('.').pop();
                const fileName = `${patientId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

                // Upload to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('patient-documents')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? { ...f, progress: 40 } : f
                ));

                // Create document record
                const { data: docRecord, error: insertError } = await supabase
                    .from('patient_documents')
                    .insert({
                        patient_id: patientId,
                        file_name: file.name,
                        file_type: file.type || fileExt || 'unknown',
                        file_path: fileName,
                        file_size: file.size,
                        extraction_status: 'pending',
                    })
                    .select()
                    .single();

                if (insertError) throw insertError;

                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? { ...f, progress: 60, status: 'analyzing', documentId: docRecord.id } : f
                ));

                // Trigger document analysis
                const formData = new FormData();
                formData.append('file', file);
                formData.append('documentId', docRecord.id);
                formData.append('patientId', patientId);
                if (category) {
                    formData.append('category', category);
                }

                const { data: { session } } = await supabase.auth.getSession();

                const analyzeResponse = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-analyzer`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${session?.access_token}`,
                        },
                        body: formData,
                    }
                );

                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? { ...f, progress: 90 } : f
                ));

                if (!analyzeResponse.ok) {
                    const errorData = await analyzeResponse.json();
                    throw new Error(errorData.error || 'Analysis failed');
                }

                // Complete!
                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? { ...f, progress: 100, status: 'complete' } : f
                ));

                toast.success(`"${file.name}" analysé avec succès`);

            } catch (error) {
                console.error('Upload error:', error);
                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? {
                        ...f,
                        status: 'error',
                        error: error instanceof Error ? error.message : 'Erreur inconnue'
                    } : f
                ));
                toast.error(`Erreur pour "${file.name}": ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
            }
        }

        setIsUploading(false);
        if (onUploadComplete) {
            onUploadComplete();
        }
    };

    const pendingCount = files.filter(f => f.status === 'pending').length;
    const completedCount = files.filter(f => f.status === 'complete').length;

    return (
        <Card className="border-border/50">
            <CardContent className="pt-6 space-y-4">
                {/* Drop Zone */}
                <div
                    {...getRootProps()}
                    className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50 hover:bg-muted/30'
                        }
          `}
                >
                    <input {...getInputProps()} />
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium">
                        {isDragActive
                            ? 'Déposez les fichiers ici...'
                            : 'Glissez-déposez des documents ou cliquez pour sélectionner'
                        }
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        PDF, Images (JPG, PNG), Excel, CSV, Word • Max 10 MB
                    </p>
                </div>

                {/* File List */}
                {files.length > 0 && (
                    <div className="space-y-2">
                        {files.map((item, index) => (
                            <div
                                key={`${item.file.name}-${index}`}
                                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                            >
                                {getFileIcon(item.file.type)}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{item.file.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatFileSize(item.file.size)}
                                    </p>
                                    {item.status !== 'pending' && item.status !== 'complete' && item.status !== 'error' && (
                                        <Progress value={item.progress} className="h-1 mt-1" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {item.status === 'pending' && (
                                        <Badge variant="outline" className="text-xs">En attente</Badge>
                                    )}
                                    {item.status === 'uploading' && (
                                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500">
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            Upload...
                                        </Badge>
                                    )}
                                    {item.status === 'analyzing' && (
                                        <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-500">
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            Analyse IA...
                                        </Badge>
                                    )}
                                    {item.status === 'complete' && (
                                        <Badge className="text-xs bg-green-500">✓ Terminé</Badge>
                                    )}
                                    {item.status === 'error' && (
                                        <Badge variant="destructive" className="text-xs">Erreur</Badge>
                                    )}
                                    {item.status === 'pending' && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => removeFile(index)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Actions */}
                {files.length > 0 && (
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {completedCount}/{files.length} fichiers traités
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setFiles([])}
                                disabled={isUploading}
                            >
                                Tout effacer
                            </Button>
                            <Button
                                size="sm"
                                onClick={uploadFiles}
                                disabled={isUploading || pendingCount === 0}
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Traitement...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Analyser {pendingCount} fichier{pendingCount > 1 ? 's' : ''}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
