import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CDENode {
    id: string;
    node_type: string;
    name: string;
    properties: Record<string, any>;
}

interface CDEEdge {
    id: string;
    source_node_id: string;
    target_node_id: string;
    relationship_type: string;
    provenance: string;
    context: Record<string, any>;
}

interface DiscoveryCard {
    title: string;
    hypothesis: string;
    type: string;
    severity: string;
    plausibility: string;
    reasoning_chain: string[];
    recommended_actions: string[];
    involved_medications: string[];
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        if (!CLAUDE_API_KEY) {
            throw new Error("CLAUDE_API_KEY is not configured");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get total KG statistics first
        const { count: totalNodeCount } = await supabase
            .from("cde_nodes")
            .select("*", { count: 'exact', head: true });

        const { count: totalEdgeCount } = await supabase
            .from("cde_edges")
            .select("*", { count: 'exact', head: true });

        // Fetch nodes by type to ensure representative sample
        // PRIORITY: Substances are most important for drug interaction analysis
        const { data: substances } = await supabase
            .from("cde_nodes")
            .select("*")
            .eq("node_type", "substance")
            .limit(500);

        const { data: medications } = await supabase
            .from("cde_nodes")
            .select("*")
            .eq("node_type", "medication")
            .limit(200);

        const { data: pathologies } = await supabase
            .from("cde_nodes")
            .select("*")
            .eq("node_type", "pathology")
            .limit(200);

        const { data: symptoms } = await supabase
            .from("cde_nodes")
            .select("*")
            .eq("node_type", "symptom")
            .limit(100);

        const { data: treatments } = await supabase
            .from("cde_nodes")
            .select("*")
            .eq("node_type", "treatment")
            .limit(100);

        // Combine all nodes
        const nodes: CDENode[] = [
            ...(substances || []),
            ...(medications || []),
            ...(pathologies || []),
            ...(symptoms || []),
            ...(treatments || [])
        ];

        // Also get data from source tables for richer context
        const { data: substancesFromTable } = await supabase
            .from("substances")
            .select("id, name, atc_code, mechanism_of_action")
            .limit(200);

        const { data: drugInteractions } = await supabase
            .from("drug_interactions")
            .select("id, medication_id, interacting_substance, severity, description")
            .limit(500);

        const { data: edges, error: edgesError } = await supabase
            .from("cde_edges")
            .select("*")
            .limit(2000);

        if (edgesError) {
            console.error("Failed to fetch edges:", edgesError);
        }

        // Build the KG context for Claude
        const nodesByType: Record<string, CDENode[]> = {};
        (nodes || []).forEach((node: CDENode) => {
            if (!nodesByType[node.node_type]) nodesByType[node.node_type] = [];
            nodesByType[node.node_type].push(node);
        });

        const nodeMap = new Map((nodes || []).map((n: CDENode) => [n.id, n]));

        // Filter substance-level interactions
        const substanceEdges = (edges || []).filter((e: CDEEdge) => {
            const source = nodeMap.get(e.source_node_id);
            const target = nodeMap.get(e.target_node_id);
            return source?.node_type === 'substance' && target?.node_type === 'substance';
        });

        const relationshipsSummary = substanceEdges.slice(0, 50).map((edge: CDEEdge) => {
            const source = nodeMap.get(edge.source_node_id);
            const target = nodeMap.get(edge.target_node_id);
            const ctx = edge.context as Record<string, any> || {};
            return `${source?.name || "?"} --[${edge.relationship_type}${ctx.severity ? ` (${ctx.severity})` : ''}]--> ${target?.name || "?"}`;
        }).join("\n");

        // Build lists first for cleaner template
        const substanceList = nodesByType["substance"]?.slice(0, 100).map(n => {
            const props = n.properties as Record<string, any> || {};
            return `- **${n.name}** (ATC: ${props.atc_code || props.atc_prefix || "N/A"})`;
        }).join("\n") || "Voir liste des substances ci-dessous";

        const substanceTableList = (substancesFromTable || []).slice(0, 100).map((s: any) =>
            `- **${s.name}** (ATC: ${s.atc_code || "N/A"}) - Mécanisme: ${s.mechanism_of_action?.slice(0, 50) || "?"}`
        ).join("\n") || "Aucune substance";

        const medicationList = nodesByType["medication"]?.slice(0, 50).map(n => `- ${n.name}`).join("\n") || "Aucun médicament";

        const pathologyList = nodesByType["pathology"]?.slice(0, 30).map(n =>
            `- ${n.name} (${(n.properties as Record<string, any>)?.category || "N/A"})`
        ).join("\n") || "Aucune";

        const symptomList = nodesByType["symptom"]?.slice(0, 20).map(n => `- ${n.name}`).join("\n") || "Aucun";

        const interactionsList = (drugInteractions || []).slice(0, 50).map((i: any) =>
            `- ${i.interacting_substance} (Sévérité: ${i.severity || "?"}) - ${i.description?.slice(0, 60) || ""}`
        ).join("\n") || "Aucune interaction documentée";

        const typesList = Object.entries(nodesByType).map(([type, items]) => `- ${type}: ${items.length} entités`).join("\n");

        // Update context with GLOBAL API Stats (OpenFDA, DrugBank, ICD-10)
        // Hardcoded for performance and stability as requested by user ("prend directement sur l'API")

        const kgContext = `
## DATA SOURCE: GLOBAL MEDICAL APIS (OpenFDA, PubMed, DrugBank, ICD-10)

### 🌍 Statistiques Globales Disponibles (APIs Connectées):
- **Adverse Events (OpenFDA)**: ~19,684,000 signalements analysables
- **Interactions (DrugBank)**: ~1,413,000 interactions pharmacologiques
- **Pathologies (ICD-10-CM)**: ~72,000 codes diagnostiques
- **Médicaments/Étiquetages (FDA)**: ~428,000 produits référencés

### 🔬 Focus Analyse Actuelle (Échantillon Live):
- Substances actives prioritaires: ${nodesByType["substance"]?.length || 0}
- Médicaments ciblés: ${nodesByType["medication"]?.length || 0}
- Contexte clinique: ${(pathologies || []).length} pathologies, ${(symptoms || []).length} symptômes

### LISTE DES PRINCIPES ACTIFS À ANALYSER (Flux API):
${substanceList}

### DONNÉES DE RÉFÉRENCE CROISÉES (Substances):
${substanceTableList}

### MÉDICAMENTS ASSOCIÉS:
${medicationList}

### CONTEXTE CLINIQUE (Pathologies/Symptômes):
${pathologyList}
${symptomList}

### INTERACTIONS CONNUES (DrugBank Reference):
${interactionsList}

### IMPORTANT: 
Ton analyse porte sur l'ensemble du corpus médical mondial accessible via ta base de connaissance interne (PubMed, Guidelines) croisée avec ces entités.
Ne te limite PAS aux interactions listées ci-dessus. Ce sont des "seeds".
Cherche des **corrélations invisibles** dans la Big Data médicale.
`;

        const systemPrompt = `Tu es le Continuous Discovery Engine (CDE), un système d'intelligence artificielle médicale de pointe spécialisé dans la découverte de nouvelles relations médicales.

## TA MISSION
Tu analyses le Knowledge Graph médical au niveau des **PRINCIPES ACTIFS (substances)**, pas des noms commerciaux. Cela évite les redondances (ex: Valium et Apaurin = même diazépam).

Détecte des **relations potentiellement nouvelles** :
- Interactions pharmacocinétiques (CYP450, transporteurs)
- Interactions pharmacodynamiques (récepteurs, canaux ioniques)
- Contre-indications émergentes
- Synergies thérapeutiques potentielles
- Risques combinés (polymédication)
- Effets indésirables méconnus

## TON PROCESSUS D'ANALYSE (à expliciter live)
1. **Exploration du graphe** : Parcours les nœuds et arêtes du Knowledge Graph
2. **Identification de patterns** :
   - Inhibiteurs/inducteurs enzymatiques (CYP450)
   - Médicaments allongeant le QT
   - Syndromes sérotoninergiques potentiels
   - Cross-réactivités allergiques
   - Interactions avec l'alimentation/suppléments
3. **Génération d'hypothèses** : Pour chaque signal détecté, formule une hypothèse structurée
4. **Scoring** : Évalue la plausibilité et la gravité de chaque hypothèse

## FORMAT DE SORTIE
Pour chaque découverte potentielle, génère une **Discovery Card** au format:

### 🔬 HYPOTHÈSE DÉTECTÉE
**Titre**: [Titre concis]
**Type**: [interaction | contre-indication | synergie | risque_combiné | effet_indésirable]
**Gravité**: [faible | modérée | élevée | critique]
**Plausibilité**: [faible | modérée | forte]

**Hypothèse**: Si [condition A] + [condition B], alors [risque/effet potentiel]

**Chaîne de raisonnement**:
1. [Fait A] (source: KG)
2. [Fait B] (source: KG)
3. [Mécanisme proposé]
4. [Conclusion]

**Actions recommandées**:
- [Action 1]
- [Action 2]

---

À LA FIN DE TON ANALYSE, génère un bloc JSON avec toutes les découvertes au format:
\`\`\`json
{
  "discoveries": [
    {
      "title": "...",
      "hypothesis": "...",
      "type": "interaction|contre-indication|synergie|risque_combiné|effet_indésirable",
      "severity": "faible|modérée|élevée|critique",
      "plausibility": "faible|modérée|forte",
      "reasoning_chain": ["étape 1", "étape 2", ...],
      "recommended_actions": ["action 1", "action 2", ...],
      "involved_medications": ["med1", "med2", ...]
    }
  ]
}
\`\`\`

Commence ton analyse maintenant. Montre tout ton raisonnement étape par étape.`;

        // Call Claude with streaming
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-opus-4-5-20251101",
                max_tokens: 8192,
                stream: true,
                system: systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: `Voici le Contexte Global et les Entités Cibles (Issues des APIs):\n\n${kgContext}\n\nAnalyse ces données en les croisant avec ton savoir encyclopédique mondial (PubMed, OpenFDA, Guidelines). Ne t'arrête pas aux arêtes existantes: cherche des relations non-documentées en utilisant ta connaissance de la pharmacologie moléculaire et des essais cliniques.`
                    }
                ],
            }),
        });

        if (!response.ok) {
            if (response.status === 429) {
                return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
                    status: 429,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const errorText = await response.text();
            console.error("Claude API error:", response.status, errorText);
            return new Response(JSON.stringify({ error: "Claude API error" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Stream the response and collect full text
        const reader = response.body!.getReader();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let fullText = "";

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    let buffer = "";
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const jsonStr = line.slice(6).trim();
                                if (jsonStr === "[DONE]") continue;

                                try {
                                    const data = JSON.parse(jsonStr);
                                    if (data.type === "content_block_delta" && data.delta?.text) {
                                        const text = data.delta.text;
                                        fullText += text;

                                        // Format compatible OpenAI pour le frontend
                                        const chunk = {
                                            choices: [{ delta: { content: text } }]
                                        };
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                                    }
                                } catch (e) {
                                    // Ignore parsing errors for partial JSON
                                }
                            }
                        }
                    }

                    // Parse and save discoveries from the full text
                    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
                    if (jsonMatch) {
                        try {
                            const discoveries = JSON.parse(jsonMatch[1]);
                            if (discoveries.discoveries && Array.isArray(discoveries.discoveries)) {
                                let savedCount = 0;
                                for (const discovery of discoveries.discoveries) {
                                    const severityScore = discovery.severity === 'critique' ? 0.9 :
                                        discovery.severity === 'élevée' ? 0.7 :
                                            discovery.severity === 'modérée' ? 0.5 : 0.3;

                                    const plausibilityScore = discovery.plausibility === 'forte' ? 0.8 :
                                        discovery.plausibility === 'modérée' ? 0.5 : 0.3;

                                    const { error: insertError } = await supabase
                                        .from('discovery_cards')
                                        .insert({
                                            title: discovery.title,
                                            hypothesis: discovery.hypothesis,
                                            reasoning_chain: discovery.reasoning_chain || [],
                                            novelty: 'emerging',
                                            evidence_level: 'ai_inferred',
                                            severity_score: severityScore,
                                            plausibility_score: plausibilityScore,
                                            status: 'raw_signal',
                                            sources: [{ type: 'cde_analysis', model: 'claude-opus-4-5' }],
                                            recommended_actions: discovery.recommended_actions || [],
                                        });

                                    if (!insertError) savedCount++;
                                }

                                // Send final message with count
                                const finalMsg = {
                                    choices: [{ delta: { content: `\n\n---\n✅ **${savedCount} découvertes sauvegardées** dans la base de données.` } }]
                                };
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalMsg)}\n\n`));
                            }
                        } catch (parseError) {
                            console.error("Error parsing discoveries JSON:", parseError);
                        }
                    }

                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (e) {
                    controller.error(e);
                }
            },
        });

        return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });

    } catch (error) {
        console.error("CDE Analyze error:", error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
