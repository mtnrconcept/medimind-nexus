import { useState, useRef, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import {
    MessageCircle,
    Send,
    Loader2,
    Brain,
    Sparkles,
    CheckCircle2,
    ArrowRight,
    RefreshCcw
} from 'lucide-react';
import { useAI } from '@/contexts/AIContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface SymptomQuestionnaireModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete: (symptoms: string[]) => void;
    initialSymptom?: string;
}

const SymptomQuestionnaireModal = ({
    open,
    onOpenChange,
    onComplete,
    initialSymptom
}: SymptomQuestionnaireModalProps) => {
    const { invokeAI } = useAI();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [identifiedSymptoms, setIdentifiedSymptoms] = useState<string[]>([]);
    const [isReadyForResearch, setIsReadyForResearch] = useState(false);
    const [confidenceLevel, setConfidenceLevel] = useState(0);
    const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Start questionnaire when modal opens
    useEffect(() => {
        if (open && messages.length === 0) {
            startQuestionnaire();
        }
    }, [open]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const startQuestionnaire = async () => {
        setLoading(true);
        try {
            const { data, error } = await invokeAI('symptom-questionnaire', {
                conversationHistory: [],
                identifiedSymptoms: [],
                initialSymptom
            });

            if (error) throw error;

            if (data.error) {
                toast.error(data.error);
                return;
            }

            // Add AI's first question
            setMessages([{
                role: 'assistant',
                content: data.nextQuestion,
                timestamp: new Date()
            }]);

            setSuggestedFollowUps(data.suggestedFollowUps || []);
            setConfidenceLevel(data.confidenceLevel || 0);

        } catch (err) {
            console.error('Erreur démarrage questionnaire:', err);
            toast.error('Erreur lors du démarrage du questionnaire');
        } finally {
            setLoading(false);
        }
    };

    const sendMessage = async (content: string) => {
        if (!content.trim() || loading) return;

        const userMessage: Message = {
            role: 'user',
            content: content.trim(),
            timestamp: new Date()
        };

        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInputValue('');
        setLoading(true);

        try {
            // Convert to format expected by Edge Function
            const conversationHistory = updatedMessages.map(m => ({
                role: m.role,
                content: m.content
            }));

            const { data, error } = await invokeAI('symptom-questionnaire', {
                conversationHistory,
                identifiedSymptoms
            });

            if (error) throw error;

            if (data.error) {
                toast.error(data.error);
                return;
            }

            // Update symptoms
            if (data.extractedSymptoms) {
                setIdentifiedSymptoms(data.extractedSymptoms);
            }

            // Update ready state
            setIsReadyForResearch(data.isReadyForResearch || false);
            setConfidenceLevel(data.confidenceLevel || 0);
            setSuggestedFollowUps(data.suggestedFollowUps || []);

            // Add AI response
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.nextQuestion,
                timestamp: new Date()
            }]);

            // Focus input for next response
            setTimeout(() => inputRef.current?.focus(), 100);

        } catch (err) {
            console.error('Erreur questionnaire:', err);
            toast.error('Erreur lors de l\'envoi du message');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(inputValue);
        }
    };

    const handleComplete = () => {
        if (identifiedSymptoms.length === 0) {
            toast.warning('Aucun symptôme identifié. Continuez le questionnaire.');
            return;
        }
        onComplete(identifiedSymptoms);
        onOpenChange(false);
        toast.success(`${identifiedSymptoms.length} symptômes identifiés. Lancement de la recherche...`);
    };

    const handleReset = () => {
        setMessages([]);
        setIdentifiedSymptoms([]);
        setIsReadyForResearch(false);
        setConfidenceLevel(0);
        setSuggestedFollowUps([]);
        startQuestionnaire();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/10 to-purple-500/10">
                    <DialogTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        Assistant de symptômes
                    </DialogTitle>
                    <DialogDescription>
                        Répondez aux questions pour identifier vos symptômes. La recherche approfondie sera lancée automatiquement.
                    </DialogDescription>
                </DialogHeader>

                {/* Identified symptoms */}
                {identifiedSymptoms.length > 0 && (
                    <div className="px-6 py-3 border-b bg-muted/30">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-muted-foreground">Symptômes identifiés:</span>
                            {identifiedSymptoms.map((symptom, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                                    {symptom}
                                </Badge>
                            ))}
                        </div>
                        {/* Progress indicator */}
                        <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-500"
                                    style={{ width: `${confidenceLevel * 100}%` }}
                                />
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {Math.round(confidenceLevel * 100)}% confiance
                            </span>
                        </div>
                    </div>
                )}

                {/* Chat area */}
                <ScrollArea className="flex-1 px-6" ref={scrollRef}>
                    <div className="py-4 space-y-4">
                        {messages.map((message, index) => (
                            <div
                                key={index}
                                className={cn(
                                    "flex gap-3",
                                    message.role === 'user' ? "justify-end" : "justify-start"
                                )}
                            >
                                {message.role === 'assistant' && (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                    </div>
                                )}
                                <div
                                    className={cn(
                                        "max-w-[80%] rounded-2xl px-4 py-2.5",
                                        message.role === 'user'
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted"
                                    )}
                                >
                                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                                </div>
                                <div className="bg-muted rounded-2xl px-4 py-3">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Suggested follow-ups */}
                {!loading && suggestedFollowUps.length > 0 && (
                    <div className="px-6 py-2 border-t bg-muted/20">
                        <div className="flex flex-wrap gap-2">
                            {suggestedFollowUps.slice(0, 2).map((suggestion, index) => (
                                <Button
                                    key={index}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => sendMessage(suggestion)}
                                >
                                    {suggestion}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input area */}
                <div className="px-6 py-4 border-t bg-card">
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleReset}
                            disabled={loading || messages.length === 0}
                            title="Recommencer"
                        >
                            <RefreshCcw className="h-4 w-4" />
                        </Button>
                        <Input
                            ref={inputRef}
                            placeholder="Décrivez vos symptômes..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={handleKeyPress}
                            disabled={loading}
                            className="flex-1"
                        />
                        <Button
                            onClick={() => sendMessage(inputValue)}
                            disabled={!inputValue.trim() || loading}
                            size="icon"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Complete button */}
                    {identifiedSymptoms.length >= 2 && (
                        <Button
                            onClick={handleComplete}
                            className={cn(
                                "w-full mt-3 transition-all",
                                isReadyForResearch
                                    ? "bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90"
                                    : ""
                            )}
                            variant={isReadyForResearch ? "default" : "outline"}
                        >
                            <Brain className="h-4 w-4 mr-2" />
                            Lancer la recherche ({identifiedSymptoms.length} symptômes)
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SymptomQuestionnaireModal;
