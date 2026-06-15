import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import DocumentUploader from '@/components/patient/DocumentUploader';

interface DocumentUploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patientId: string;
    onUploadComplete?: () => void;
    trigger?: React.ReactNode;
    category?: string;
}

export function DocumentUploadDialog({
    open,
    onOpenChange,
    patientId,
    onUploadComplete,
    trigger,
    category
}: DocumentUploadDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* If a trigger button is passed, we can use it here if needed, 
                but typically the parent handles the "open" state via button click. 
                However, DialogTrigger can be used if we refactor. 
                For now, we rely on controlled state. 
            */}
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" />
                        Importer un document
                    </DialogTitle>
                    <DialogDescription>
                        Analysez une ordonnance, un compte-rendu ou une analyse biologique pour extraire automatiquement les données.
                    </DialogDescription>
                </DialogHeader>
                <DocumentUploader
                    patientId={patientId}
                    category={category}
                    onUploadComplete={() => {
                        onUploadComplete?.();
                        onOpenChange(false);
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
