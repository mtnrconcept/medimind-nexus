/**
 * MobileBottomNav - Bottom navigation bar for mobile patient dossier
 * Shows 5 tabs: Twin | Data | Menu | Docs | AI
 */

import { Activity, FileText, LayoutGrid, MessageSquare, User } from 'lucide-react';

export type MobileTab = 'twin' | 'summary' | 'menu' | 'docs' | 'ai';

interface MobileBottomNavProps {
    activeTab: MobileTab;
    onTabChange: (tab: MobileTab) => void;
}

const tabs: { key: MobileTab; icon: React.ElementType; label: string }[] = [
    { key: 'twin', icon: Activity, label: 'Twin' },
    { key: 'summary', icon: User, label: 'Résumé' },
    { key: 'menu', icon: LayoutGrid, label: 'Menu' },
    { key: 'docs', icon: FileText, label: 'Docs' },
    { key: 'ai', icon: MessageSquare, label: 'IA' },
];

export const MobileBottomNav = ({ activeTab, onTabChange }: MobileBottomNavProps) => {
    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-700 safe-area-inset-bottom">
            <div className="flex items-center justify-around h-16">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => onTabChange(tab.key)}
                            className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 touch-manipulation transition-colors ${isActive
                                    ? 'text-primary'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                        >
                            <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                            <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : ''}`}>
                                {tab.label}
                            </span>
                            {isActive && (
                                <div className="absolute bottom-1 w-8 h-0.5 bg-primary rounded-full" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default MobileBottomNav;
