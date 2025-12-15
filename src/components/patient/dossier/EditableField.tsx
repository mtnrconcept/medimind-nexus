/**
 * EditableField - Inline editable field with pencil button
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableFieldProps {
    label: string;
    value: string | number | null | undefined;
    onSave: (value: string) => void;
    type?: 'text' | 'number' | 'date';
    suffix?: string;
    className?: string;
}

const EditableField = ({
    label,
    value,
    onSave,
    type = 'text',
    suffix,
    className
}: EditableFieldProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(String(value || ''));

    const handleSave = () => {
        onSave(editValue);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditValue(String(value || ''));
        setIsEditing(false);
    };

    return (
        <div className={cn("group flex items-center justify-between py-1", className)}>
            <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                {isEditing ? (
                    <div className="flex items-center gap-1 mt-1">
                        <Input
                            type={type}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSave}>
                            <Check className="h-3 w-3 text-green-500" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCancel}>
                            <X className="h-3 w-3 text-red-500" />
                        </Button>
                    </div>
                ) : (
                    <div className="text-sm font-medium flex items-center gap-1">
                        {value || <span className="text-muted-foreground italic">Non renseigné</span>}
                        {suffix && value && <span className="text-xs text-muted-foreground">{suffix}</span>}
                    </div>
                )}
            </div>
            {!isEditing && (
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => setIsEditing(true)}
                >
                    <Pencil className="h-3 w-3" />
                </Button>
            )}
        </div>
    );
};

export default EditableField;
