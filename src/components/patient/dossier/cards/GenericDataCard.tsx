/**
 * GenericDataCard - Reusable card for categories that share similar data structure
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface GenericDataCardProps {
    patientId: string;
    table: string;
    titleField: string;
    dateField?: string;
    descriptionField?: string;
    emptyIcon: React.ReactNode;
    emptyText: string;
}

const GenericDataCard = ({
    patientId,
    table,
    titleField,
    dateField,
    descriptionField,
    emptyIcon,
    emptyText
}: GenericDataCardProps) => {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from(table)
            .select('*')
            .eq('patient_id', patientId)
            .order(dateField || 'created_at', { ascending: false });
        setItems(data || []);
        setLoading(false);
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{items.length} entrée(s)</span>
                <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" />Ajouter</Button>
            </div>

            <ScrollArea className="h-[400px]">
                {items.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        {emptyIcon}
                        <p className="mt-2">{emptyText}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {items.map((item) => (
                            <div key={item.id} className="p-3 rounded-lg border bg-card hover:bg-muted/50">
                                <div className="font-medium text-sm">{item[titleField]}</div>
                                {descriptionField && item[descriptionField] && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item[descriptionField]}</p>
                                )}
                                {dateField && item[dateField] && (
                                    <div className="text-[10px] text-muted-foreground mt-2">
                                        {format(new Date(item[dateField]), 'dd MMM yyyy', { locale: fr })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};

export default GenericDataCard;
