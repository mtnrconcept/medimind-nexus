import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2, AlertCircle, Circle } from 'lucide-react';

export interface ResearchStep {
    id: number;
    title: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    details?: string;
    timestamp?: Date;
}

interface ResearchJourneyStepProps {
    step: ResearchStep;
    isLast?: boolean;
}

const ResearchJourneyStep = ({ step, isLast = false }: ResearchJourneyStepProps) => {
    const getStatusIcon = () => {
        switch (step.status) {
            case 'completed':
                return <CheckCircle2 className="h-5 w-5 text-green-500" />;
            case 'running':
                return <Loader2 className="h-5 w-5 text-violet-500 animate-spin" />;
            case 'error':
                return <AlertCircle className="h-5 w-5 text-red-500" />;
            default:
                return <Circle className="h-5 w-5 text-slate-300" />;
        }
    };

    const getStatusStyles = () => {
        switch (step.status) {
            case 'completed':
                return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
            case 'running':
                return 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 animate-pulse';
            case 'error':
                return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
            default:
                return 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-50';
        }
    };

    return (
        <div className="relative flex gap-4">
            {/* Timeline connector */}
            {!isLast && (
                <div className="absolute left-[22px] top-12 w-0.5 h-[calc(100%-24px)] bg-gradient-to-b from-slate-300 to-slate-200 dark:from-slate-600 dark:to-slate-700" />
            )}

            {/* Step number circle */}
            <div className={cn(
                "flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm z-10",
                step.status === 'completed' && "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
                step.status === 'running' && "bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300",
                step.status === 'error' && "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
                step.status === 'pending' && "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
            )}>
                {step.id}
            </div>

            {/* Step content card */}
            <div className={cn(
                "flex-1 p-4 rounded-xl border transition-all duration-300 mb-4",
                getStatusStyles()
            )}>
                <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        {getStatusIcon()}
                        {step.title}
                    </h4>
                    {step.timestamp && (
                        <span className="text-xs text-slate-400">
                            {step.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    )}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{step.description}</p>
                {step.details && (
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 font-mono bg-white/50 dark:bg-black/20 rounded px-2 py-1">
                        {step.details}
                    </p>
                )}
            </div>
        </div>
    );
};

export default ResearchJourneyStep;
