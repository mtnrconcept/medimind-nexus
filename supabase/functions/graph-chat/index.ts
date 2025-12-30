import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/ai-client.ts";

/**
 * GRAPH CHAT - Chat IA pour le Knowledge Graph
 * 
 * Mode 1: analysis_qa - Q&A sur les résultats d'analyse de liens/nœuds
 * Mode 2: graph_command - Commandes naturelles pour manipuler le graphe
 * 
 * Configuration: claude-sonnet-4-20250514, temperature=0.4, streaming
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Types
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface GraphNode {
    id: string;
    name: string;
    node_type: string;
    ring: number;
}

interface GraphEdge {
    id: string;
    source: string;
    target: string;
    relationship: string;
}

interface GraphAction {
    type: 'CREATE_GROUP' | 'FILTER_VISIBILITY' | 'ADD_NODE' | 'RESET_VIEW' | 'HIGHLIGHT_NODE' | 'INFO_RESPONSE'
    | 'SHOW_ONLY_NODES' | 'SHOW_ONLY_NODE_TYPES' | 'HIDE_NODES' | 'ARRANGE_LAYOUT'
    | 'AUTO_GROUP_BY_TYPE' | 'HIDE_GROUP' | 'SHOW_ONLY_GROUP' | 'SET_CENTRAL';
    params: {
        nodeType?: string;
        nodeName?: string;
        nodeNames?: string[];
        nodeTypes?: string[];
        groupName?: string;
        groupId?: string;
        layout?: 'corners' | 'grid' | 'radial';
        filterCondition?: string;
        nodeId?: string;
    };
    response: string;
}

interface ChatRequest {
    mode: 'analysis_qa' | 'graph_command';
    message: string;
    context: {
        analysisContent?: string;
        graphState?: {
            nodes: GraphNode[];
            edges: GraphEdge[];
        };
        pathology?: string;
        conversationHistory?: ChatMessage[];
        sourceNode?: string;
        targetNode?: string;
    };
}

// System prompts
const ANALYSIS_QA_PROMPT = `Tu es MEDIMIND Graph Assistant, un assistant IA spécialisé dans l'explication des analyses de liens du Knowledge Graph médical.

# CONTEXTE
L'utilisateur consulte une analyse de lien entre des concepts médicaux (médicaments, pathologies, symptômes, etc.) et souhaite poser des questions pour mieux comprendre.

# TON RÔLE
- Répondre de manière claire et accessible aux questions sur l'analyse affichée
- Vulgariser les termes médicaux complexes si demandé
- Expliquer les implications cliniques
- Clarifier les niveaux de preuve et leur signification
- Suggérer des questions de suivi pertinentes

# FORMAT
- Réponses concises mais complètes (2-4 paragraphes max)
- Utilise des bullet points pour lister des éléments
- Utilise des emojis médicaux appropriés (💊 🩺 ⚠️ ✅)
- Si tu ne sais pas, dis-le clairement

Réponds TOUJOURS en français.`;

const GRAPH_COMMAND_PROMPT = `Tu es MEDIMIND Graph Controller, un assistant IA spécialisé dans le contrôle du Knowledge Graph médical via des commandes en langage naturel.

# TON RÔLE
Interpréter les commandes de l'utilisateur et les convertir en actions structurées sur le graphe.

# ACTIONS DISPONIBLES (14 types)

## Gestion des Nœuds

1. **ADD_NODE** - Ajouter un nouveau nœud et analyser ses liens
   - Params: { nodeName: string }
   - Exemples: "Ajoute Aspirine", "Ajoute un nœud VIH", "Ajoute maux de tête"

2. **HIDE_NODES** - Cacher des nœuds spécifiques
   - Params: { nodeNames: string[] }
   - Exemples: "Cache le nœud Diabète", "Cache Aspirine et Ibuprofène"

3. **SHOW_ONLY_NODES** - Afficher uniquement ces nœuds (cacher tous les autres)
   - Params: { nodeNames: string[] }
   - Exemples: "Garde uniquement Metformine et Insuline visibles", "Montre seulement ces nœuds: Cancer, Chimiothérapie"

4. **SHOW_ONLY_NODE_TYPES** - Afficher uniquement certains types de nœuds
   - Params: { nodeTypes: string[] } (DRUG, SYMPTOM, PATHOLOGY, TREATMENT, MECHANISM, etc.)
   - Exemples: "Garde uniquement les médicaments visibles", "Montre seulement les symptômes et pathologies"

5. **HIGHLIGHT_NODE** - Mettre en évidence un nœud spécifique
   - Params: { nodeName: string }
   - Exemples: "Surligne Diabète", "Montre-moi le nœud Cancer"

6. **SET_CENTRAL** - Définir un nouveau nœud central et régénérer le graphe
   - Params: { nodeName: string }
   - Exemples: "Ce nœud devient le nœud central", "Régénère le graphe autour de VIH", "Fais de Diabète le centre"

## Gestion des Groupes

7. **CREATE_GROUP** - Créer un groupe avec des nœuds spécifiques ou par type
   - Params: { nodeType?: string, nodeNames?: string[], groupName?: string }
   - Exemples: "Crée un groupe avec tous les médicaments", "Crée un groupe 'Antibiothérapie' avec Amoxicilline et Ceftriaxone"

8. **AUTO_GROUP_BY_TYPE** - Créer automatiquement des groupes pour chaque type de nœud
   - Params: {} (aucun)
   - Exemples: "Crée des groupes pour chaque type de nœuds", "Organise par type", "Range les nœuds dans des groupes par catégorie"

9. **HIDE_GROUP** - Cacher un groupe entier
   - Params: { groupName: string }
   - Exemples: "Cache le groupe médicaments", "Cache ce groupe"

10. **SHOW_ONLY_GROUP** - Afficher uniquement un groupe (cacher tout le reste)
    - Params: { groupName: string }
    - Exemples: "Laisse uniquement le groupe symptômes visible", "Montre seulement ce groupe"

## Disposition et Vue

11. **ARRANGE_LAYOUT** - Réorganiser les nœuds selon une disposition
    - Params: { layout: 'corners' | 'grid' | 'radial' }
    - Exemples: "Regroupe les nœuds dans les coins", "Arrange en grille", "Disposition radiale"

12. **FILTER_VISIBILITY** - Filtrer sur un nœud spécifique pour voir ses connexions
    - Params: { nodeName: string }
    - Exemples: "Montre les interactions avec Metformine", "Filtre sur Diabète"

13. **RESET_VIEW** - Réinitialiser la vue du graphe (tout afficher, dissoudre les groupes)
    - Params: {} (aucun)
    - Exemples: "Réinitialise le graphe", "Affiche tout", "Annule les filtres"

14. **INFO_RESPONSE** - Réponse informative sans action sur le graphe
    - Exemples: Questions générales, demandes de clarification

# FORMAT DE RÉPONSE OBLIGATOIRE (JSON strict)
{
    "action": {
        "type": "ACTION_TYPE",
        "params": { ... }
    },
    "response": "Message convivial confirmant l'action"
}

# RÈGLES IMPORTANTES
- Toujours répondre en JSON valide
- Le champ "response" doit confirmer l'action de manière amicale avec des emojis
- Si la commande n'est pas claire, utilise INFO_RESPONSE pour demander des clarifications
- Pour les noms de nœuds, utilise les noms EXACTS fournis par l'utilisateur
- Si l'utilisateur mentionne un type de nœud, traduis vers: DRUG, SYMPTOM, PATHOLOGY, TREATMENT, MECHANISM, RISK_FACTOR

Réponds TOUJOURS en français.`;

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: ChatRequest = await req.json();

        if (!request.message) {
            return new Response(
                JSON.stringify({ error: "message is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // API keys are handled by callAI

        console.log(`[GRAPH-CHAT] Mode: ${request.mode}, Message: ${request.message.substring(0, 50)}...`);

        // Build context based on mode
        let systemPrompt: string;
        let userMessage: string;

        if (request.mode === 'analysis_qa') {
            systemPrompt = ANALYSIS_QA_PROMPT;
            userMessage = `# CONTENU DE L'ANALYSE
${request.context.analysisContent || 'Aucune analyse disponible'}

# LIEN ANALYSÉ
${request.context.sourceNode || 'N/A'} → ${request.context.targetNode || 'N/A'}

# PATHOLOGIE CENTRALE
${request.context.pathology || 'Non spécifiée'}

# HISTORIQUE DE CONVERSATION
${request.context.conversationHistory?.map(m => `${m.role === 'user' ? '👤' : '🤖'}: ${m.content}`).join('\n') || 'Aucun historique'}

# QUESTION DE L'UTILISATEUR
${request.message}`;
        } else {
            // graph_command mode
            systemPrompt = GRAPH_COMMAND_PROMPT;

            const nodes = request.context.graphState?.nodes || [];
            const edges = request.context.graphState?.edges || [];

            // Summarize graph state
            const nodesByType = new Map<string, string[]>();
            nodes.forEach(n => {
                if (!nodesByType.has(n.node_type)) nodesByType.set(n.node_type, []);
                nodesByType.get(n.node_type)!.push(n.name);
            });

            const graphSummary = Array.from(nodesByType.entries())
                .map(([type, names]) => `- ${type}: ${names.slice(0, 10).join(', ')}${names.length > 10 ? ` (+${names.length - 10} autres)` : ''}`)
                .join('\n');

            userMessage = `# ÉTAT ACTUEL DU GRAPHE

## Pathologie centrale
${request.context.pathology || 'Non spécifiée'}

## Nœuds (${nodes.length} total)
${graphSummary}

## Arêtes
${edges.length} connexions

## Liste complète des nœuds
${nodes.map(n => n.name).join(', ')}

# COMMANDE DE L'UTILISATEUR
${request.message}

Réponds en JSON valide.`;
        }

        // Build conversation history for Claude
        const messages: { role: 'user' | 'assistant', content: string }[] = [];

        // Add history if present
        if (request.context.conversationHistory && request.context.conversationHistory.length > 0) {
            for (const msg of request.context.conversationHistory.slice(-6)) { // Keep last 6 messages
                messages.push({ role: msg.role, content: msg.content });
            }
        }

        // Add current message
        messages.push({ role: 'user', content: userMessage });

        // Call AI with Gemini fallback
        const aiResponse = await callAI(
            systemPrompt,
            userMessage,
            {
                model: "claude-3-5-sonnet-20240620",
                temperature: 0.4
            }
        );

        let textContent = aiResponse.text;

        // For graph_command mode, parse the action
        let response: any = { message: textContent };

        if (request.mode === 'graph_command') {
            try {
                // Extract JSON from response
                const jsonMatch = textContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    response = {
                        action: parsed.action,
                        message: parsed.response || parsed.message || textContent
                    };
                }
            } catch (e) {
                console.error("[GRAPH-CHAT] JSON parse error:", e);
                response = {
                    action: { type: 'INFO_RESPONSE', params: {} },
                    message: textContent
                };
            }
        }

        console.log(`[GRAPH-CHAT] Response generated successfully`);

        return new Response(
            JSON.stringify(response),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("[GRAPH-CHAT] Error:", error);
        return new Response(
            JSON.stringify({ error: "Graph chat failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
