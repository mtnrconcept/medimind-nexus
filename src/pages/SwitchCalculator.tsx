import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
    ArrowRight,
    ArrowRightLeft,
    Pill,
    AlertTriangle,
    Clock,
    Activity,
    Brain,
    Heart,
    Info,
    Calculator
} from "lucide-react";

interface DrugEquivalence {
    id: string;
    category: string;
    drug_name: string;
    equivalent_dose: number;
    unit: string;
    reference_drug: string;
    reference_dose: number;
    half_life_hours: number | null;
    half_life_range: string | null;
    onset: string | null;
    duration: string | null;
    active_metabolites: boolean;
    notes: string | null;
}

const SwitchCalculator = () => {
    const [category, setCategory] = useState<string>("benzodiazepine");
    const [fromDrug, setFromDrug] = useState<string>("");
    const [toDrug, setToDrug] = useState<string>("");
    const [fromDose, setFromDose] = useState<string>("");

    // Fetch drug equivalences
    const { data: equivalences, isLoading } = useQuery({
        queryKey: ["drug-equivalences", category],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("drug_equivalences")
                .select("*")
                .eq("category", category)
                .order("drug_name");

            if (error) throw error;
            return data as DrugEquivalence[];
        },
    });

    const fromDrugData = equivalences?.find(e => e.drug_name === fromDrug);
    const toDrugData = equivalences?.find(e => e.drug_name === toDrug);

    // Calculate equivalent dose
    const calculateEquivalence = (): number | null => {
        if (!fromDrugData || !toDrugData || !fromDose || parseFloat(fromDose) <= 0) {
            return null;
        }

        const doseNumber = parseFloat(fromDose);
        // Convert from source drug to reference (e.g., diazepam 10mg)
        const referenceEquivalent = (doseNumber / fromDrugData.equivalent_dose) * fromDrugData.reference_dose;
        // Convert from reference to target drug
        const targetDose = (referenceEquivalent / toDrugData.reference_dose) * toDrugData.equivalent_dose;

        return Math.round(targetDose * 100) / 100;
    };

    const equivalentDose = calculateEquivalence();

    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case "benzodiazepine": return <Brain className="h-4 w-4" />;
            case "antipsychotic": return <Activity className="h-4 w-4" />;
            case "opioid": return <Pill className="h-4 w-4" />;
            case "antidepressant": return <Heart className="h-4 w-4" />;
            default: return <Pill className="h-4 w-4" />;
        }
    };

    const getOnsetBadgeColor = (onset: string | null) => {
        switch (onset) {
            case "rapid": return "bg-green-500/20 text-green-400 border-green-500/30";
            case "intermediate": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
            case "slow": return "bg-red-500/20 text-red-400 border-red-500/30";
            default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
        }
    };

    const getDurationBadgeColor = (duration: string | null) => {
        switch (duration) {
            case "short": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
            case "intermediate": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
            case "long": return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30";
            default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30">
                        <ArrowRightLeft className="h-8 w-8 text-teal-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Calculateur d'Équivalence</h1>
                        <p className="text-slate-400">
                            Convertissez les doses lors d'un changement de traitement
                        </p>
                    </div>
                </div>

                {/* Category Tabs */}
                <Tabs value={category} onValueChange={(v) => { setCategory(v); setFromDrug(""); setToDrug(""); }}>
                    <TabsList className="bg-slate-800/50 border border-slate-700">
                        <TabsTrigger value="benzodiazepine" className="data-[state=active]:bg-teal-600">
                            <Brain className="h-4 w-4 mr-2" />
                            Benzodiazépines
                        </TabsTrigger>
                        <TabsTrigger value="antipsychotic" className="data-[state=active]:bg-purple-600">
                            <Activity className="h-4 w-4 mr-2" />
                            Antipsychotiques
                        </TabsTrigger>
                        <TabsTrigger value="opioid" className="data-[state=active]:bg-orange-600" disabled>
                            <Pill className="h-4 w-4 mr-2" />
                            Opioïdes
                            <Badge variant="outline" className="ml-2 text-xs">Bientôt</Badge>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value={category} className="mt-6 space-y-6">
                        {/* Drug Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            {/* From Drug */}
                            <Card className="bg-slate-800/50 border-slate-700">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium text-slate-300">
                                        Médicament actuel
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <Select value={fromDrug} onValueChange={setFromDrug}>
                                        <SelectTrigger className="bg-slate-700/50 border-slate-600">
                                            <SelectValue placeholder="Sélectionner..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {equivalences?.map((eq) => (
                                                <SelectItem key={eq.id} value={eq.drug_name}>
                                                    {eq.drug_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div>
                                        <Label className="text-xs text-slate-400">Dose actuelle</Label>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Input
                                                type="number"
                                                value={fromDose}
                                                onChange={(e) => setFromDose(e.target.value)}
                                                placeholder="0"
                                                className="bg-slate-700/50 border-slate-600"
                                            />
                                            <span className="text-slate-400 text-sm">
                                                {fromDrugData?.unit || "mg"}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Arrow */}
                            <div className="flex justify-center items-center">
                                <div className="p-4 rounded-full bg-gradient-to-r from-teal-500/20 to-cyan-500/20 border border-teal-500/30">
                                    <ArrowRight className="h-8 w-8 text-teal-400" />
                                </div>
                            </div>

                            {/* To Drug */}
                            <Card className="bg-slate-800/50 border-slate-700">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium text-slate-300">
                                        Nouveau médicament
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <Select value={toDrug} onValueChange={setToDrug}>
                                        <SelectTrigger className="bg-slate-700/50 border-slate-600">
                                            <SelectValue placeholder="Sélectionner..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {equivalences?.filter(eq => eq.drug_name !== fromDrug).map((eq) => (
                                                <SelectItem key={eq.id} value={eq.drug_name}>
                                                    {eq.drug_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div>
                                        <Label className="text-xs text-slate-400">Dose équivalente</Label>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className={`flex-1 p-2 rounded-md text-center font-bold text-xl ${equivalentDose ? "bg-teal-500/20 text-teal-300 border border-teal-500/30" : "bg-slate-700/50 text-slate-500"
                                                }`}>
                                                {equivalentDose !== null ? equivalentDose : "—"}
                                            </div>
                                            <span className="text-slate-400 text-sm">
                                                {toDrugData?.unit || "mg"}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Comparison Details */}
                        {fromDrugData && toDrugData && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* From Drug Details */}
                                <Card className="bg-slate-800/50 border-slate-700">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            {getCategoryIcon(category)}
                                            {fromDrugData.drug_name}
                                        </CardTitle>
                                        <CardDescription>
                                            Équivalent à {fromDrugData.reference_dose}mg de {fromDrugData.reference_drug}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {fromDrugData.onset && (
                                                <Badge variant="outline" className={getOnsetBadgeColor(fromDrugData.onset)}>
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    Début: {fromDrugData.onset === "rapid" ? "Rapide" : fromDrugData.onset === "intermediate" ? "Intermédiaire" : "Lent"}
                                                </Badge>
                                            )}
                                            {fromDrugData.duration && (
                                                <Badge variant="outline" className={getDurationBadgeColor(fromDrugData.duration)}>
                                                    Durée: {fromDrugData.duration === "short" ? "Courte" : fromDrugData.duration === "intermediate" ? "Intermédiaire" : "Longue"}
                                                </Badge>
                                            )}
                                            {fromDrugData.active_metabolites && (
                                                <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                    Métabolites actifs
                                                </Badge>
                                            )}
                                        </div>
                                        {fromDrugData.half_life_range && (
                                            <div className="text-sm text-slate-400">
                                                <span className="font-medium">Demi-vie:</span> {fromDrugData.half_life_range}h
                                            </div>
                                        )}
                                        {fromDrugData.notes && (
                                            <div className="text-sm text-slate-400 bg-slate-900/50 p-2 rounded">
                                                <Info className="h-3 w-3 inline mr-1" />
                                                {fromDrugData.notes}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* To Drug Details */}
                                <Card className="bg-slate-800/50 border-slate-700">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            {getCategoryIcon(category)}
                                            {toDrugData.drug_name}
                                        </CardTitle>
                                        <CardDescription>
                                            Équivalent à {toDrugData.reference_dose}mg de {toDrugData.reference_drug}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {toDrugData.onset && (
                                                <Badge variant="outline" className={getOnsetBadgeColor(toDrugData.onset)}>
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    Début: {toDrugData.onset === "rapid" ? "Rapide" : toDrugData.onset === "intermediate" ? "Intermédiaire" : "Lent"}
                                                </Badge>
                                            )}
                                            {toDrugData.duration && (
                                                <Badge variant="outline" className={getDurationBadgeColor(toDrugData.duration)}>
                                                    Durée: {toDrugData.duration === "short" ? "Courte" : toDrugData.duration === "intermediate" ? "Intermédiaire" : "Longue"}
                                                </Badge>
                                            )}
                                            {toDrugData.active_metabolites && (
                                                <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                    Métabolites actifs
                                                </Badge>
                                            )}
                                        </div>
                                        {toDrugData.half_life_range && (
                                            <div className="text-sm text-slate-400">
                                                <span className="font-medium">Demi-vie:</span> {toDrugData.half_life_range}h
                                            </div>
                                        )}
                                        {toDrugData.notes && (
                                            <div className="text-sm text-slate-400 bg-slate-900/50 p-2 rounded">
                                                <Info className="h-3 w-3 inline mr-1" />
                                                {toDrugData.notes}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Clinical Warning */}
                        {equivalentDose && (
                            <Alert className="bg-amber-500/10 border-amber-500/30">
                                <AlertTriangle className="h-4 w-4 text-amber-400" />
                                <AlertTitle className="text-amber-400">Avertissement clinique</AlertTitle>
                                <AlertDescription className="text-amber-300/80">
                                    Ces équivalences sont indicatives et basées sur la littérature. Le switch doit être
                                    individualisé selon le patient (fonction hépatique, rénale, interactions, tolérance).
                                    Une titration progressive est généralement recommandée.
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Reference Table */}
                        <Card className="bg-slate-800/50 border-slate-700">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Calculator className="h-5 w-5 text-teal-400" />
                                    Table d'équivalence complète
                                </CardTitle>
                                <CardDescription>
                                    {category === "benzodiazepine"
                                        ? "Référence: Diazépam 10mg oral"
                                        : "Référence: Chlorpromazine 100mg oral"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-700">
                                                <th className="text-left p-2 text-slate-400">Médicament</th>
                                                <th className="text-center p-2 text-slate-400">Dose équivalente</th>
                                                <th className="text-center p-2 text-slate-400">Demi-vie</th>
                                                <th className="text-center p-2 text-slate-400">Début</th>
                                                <th className="text-center p-2 text-slate-400">Durée</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {equivalences?.map((eq) => (
                                                <tr
                                                    key={eq.id}
                                                    className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${eq.drug_name === fromDrug ? "bg-teal-500/10" :
                                                            eq.drug_name === toDrug ? "bg-cyan-500/10" : ""
                                                        }`}
                                                >
                                                    <td className="p-2 font-medium text-slate-200">
                                                        {eq.drug_name}
                                                        {eq.active_metabolites && (
                                                            <Badge variant="outline" className="ml-2 text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
                                                                M
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td className="text-center p-2 text-slate-300">
                                                        {eq.equivalent_dose} {eq.unit}
                                                    </td>
                                                    <td className="text-center p-2 text-slate-400">
                                                        {eq.half_life_range ? `${eq.half_life_range}h` : "—"}
                                                    </td>
                                                    <td className="text-center p-2">
                                                        {eq.onset && (
                                                            <Badge variant="outline" className={`text-xs ${getOnsetBadgeColor(eq.onset)}`}>
                                                                {eq.onset === "rapid" ? "Rapide" : eq.onset === "intermediate" ? "Inter." : "Lent"}
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td className="text-center p-2">
                                                        {eq.duration && (
                                                            <Badge variant="outline" className={`text-xs ${getDurationBadgeColor(eq.duration)}`}>
                                                                {eq.duration === "short" ? "Court" : eq.duration === "intermediate" ? "Inter." : "Long"}
                                                            </Badge>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default SwitchCalculator;
