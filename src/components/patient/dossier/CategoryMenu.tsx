/**
 * CategoryMenu - Icon-based menu for patient dossier categories
 * Clicking an icon opens the corresponding FloatingCard
 */

import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Hospital,
    Users,
    AlertTriangle,
    Pill,
    Syringe,
    Activity,
    Heart,
    FlaskConical,
    Image,
    Stethoscope,
    Baby,
    Brain,
    Home,
    Shield,
    Smile,
    FileText,
    MessageSquare,
    LineChart,
    UserCircle,
    CalendarCheck,
    Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type CategoryKey =
    | 'medical_history'
    | 'family_history'
    | 'allergies'
    | 'medications'
    | 'vaccinations'
    | 'lifestyle'
    | 'clinical_data'
    | 'lab_results'
    | 'imaging'
    | 'functional_exams'
    | 'reproductive'
    | 'mental_health'
    | 'social_factors'
    | 'consultations'
    | 'prevention'
    | 'dental'
    | 'documents'
    | 'communications'
    | 'monitoring'
    | 'age_specific'
    | 'side_effects';

interface CategoryConfig {
    key: CategoryKey;
    label: string;
    icon: ReactNode;
    color: string;
}

export const CATEGORIES: CategoryConfig[] = [
    { key: 'medical_history', label: 'Antécédents personnels', icon: <Hospital className="h-5 w-5" />, color: 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/20' },
    { key: 'family_history', label: 'Antécédents familiaux', icon: <Users className="h-5 w-5" />, color: 'text-purple-500 bg-purple-500/10 hover:bg-purple-500/20' },
    { key: 'allergies', label: 'Allergies', icon: <AlertTriangle className="h-5 w-5" />, color: 'text-red-500 bg-red-500/10 hover:bg-red-500/20' },
    { key: 'medications', label: 'Traitements', icon: <Pill className="h-5 w-5" />, color: 'text-green-500 bg-green-500/10 hover:bg-green-500/20' },
    { key: 'vaccinations', label: 'Vaccinations', icon: <Syringe className="h-5 w-5" />, color: 'text-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20' },
    { key: 'lifestyle', label: 'Mode de vie', icon: <Activity className="h-5 w-5" />, color: 'text-orange-500 bg-orange-500/10 hover:bg-orange-500/20' },
    { key: 'clinical_data', label: 'Données cliniques', icon: <Heart className="h-5 w-5" />, color: 'text-pink-500 bg-pink-500/10 hover:bg-pink-500/20' },
    { key: 'lab_results', label: 'Biologie', icon: <FlaskConical className="h-5 w-5" />, color: 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20' },
    { key: 'imaging', label: 'Imagerie', icon: <Image className="h-5 w-5" />, color: 'text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20' },
    { key: 'functional_exams', label: 'Examens fonctionnels', icon: <Stethoscope className="h-5 w-5" />, color: 'text-violet-500 bg-violet-500/10 hover:bg-violet-500/20' },
    { key: 'reproductive', label: 'Santé reproductive', icon: <Baby className="h-5 w-5" />, color: 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/20' },
    { key: 'mental_health', label: 'Santé mentale', icon: <Brain className="h-5 w-5" />, color: 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' },
    { key: 'social_factors', label: 'Facteurs sociaux', icon: <Home className="h-5 w-5" />, color: 'text-teal-500 bg-teal-500/10 hover:bg-teal-500/20' },
    { key: 'consultations', label: 'Consultations', icon: <CalendarCheck className="h-5 w-5" />, color: 'text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20' },
    { key: 'prevention', label: 'Prévention', icon: <Shield className="h-5 w-5" />, color: 'text-lime-500 bg-lime-500/10 hover:bg-lime-500/20' },
    { key: 'dental', label: 'Dentaire', icon: <Smile className="h-5 w-5" />, color: 'text-sky-500 bg-sky-500/10 hover:bg-sky-500/20' },
    { key: 'documents', label: 'Documents', icon: <FileText className="h-5 w-5" />, color: 'text-slate-500 bg-slate-500/10 hover:bg-slate-500/20' },
    { key: 'communications', label: 'Correspondances', icon: <MessageSquare className="h-5 w-5" />, color: 'text-fuchsia-500 bg-fuchsia-500/10 hover:bg-fuchsia-500/20' },
    { key: 'monitoring', label: 'Suivi', icon: <LineChart className="h-5 w-5" />, color: 'text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20' },
    { key: 'age_specific', label: 'Spécifique âge', icon: <UserCircle className="h-5 w-5" />, color: 'text-stone-500 bg-stone-500/10 hover:bg-stone-500/20' },
    { key: 'side_effects', label: 'Alertes IA', icon: <Zap className="h-5 w-5" />, color: 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' },
];

interface CategoryMenuProps {
    activeCategory: CategoryKey | null;
    onSelectCategory: (category: CategoryKey) => void;
    className?: string;
}

const CategoryMenu = ({ activeCategory, onSelectCategory, className }: CategoryMenuProps) => {
    return (
        <Card className={cn("", className)}>
            <CardContent className="p-2">
                <div className="flex flex-col gap-1">
                    {CATEGORIES.map((cat) => (
                        <Button
                            key={cat.key}
                            variant="ghost"
                            className={cn(
                                "h-9 justify-start gap-2 px-3 rounded-lg transition-all text-sm",
                                cat.color,
                                activeCategory === cat.key && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                            )}
                            onClick={() => onSelectCategory(cat.key)}
                        >
                            {cat.icon}
                            <span className="truncate">{cat.label}</span>
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default CategoryMenu;
